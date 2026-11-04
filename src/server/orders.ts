import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PaymentError } from "./payments/settlement";

export const CheckoutInput = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(20),
  city: z.string().min(1).max(40),
  deliverOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  senderName: z.string().trim().min(1).max(80),
  senderContact: z.string().trim().min(5).max(120),
  recipientName: z.string().trim().min(1).max(80),
  recipientPhone: z.string().trim().regex(/^(\+977)?9[78]\d{8}$/, "Enter a Nepali mobile number, e.g. 98XXXXXXXX"),
  line1: z.string().trim().min(3).max(160),
  landmark: z.string().trim().max(160).optional().default(""),
  ward: z.number().int().min(1).max(40).optional(),
  giftMessage: z.string().trim().max(300).optional().default(""),
});
export type CheckoutInput = z.infer<typeof CheckoutInput>;

/** Today's date and clock time in Nepal (UTC+5:45). */
export function nepalNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}` };
}

const newOrderNumber = () => `KS-${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`;

/**
 * Create an order. Every price, fee and cost is read from the database here:
 * the client sends only product ids and quantities.
 */
export async function createOrder(input: CheckoutInput, existingUserId: string | null, now = new Date()) {
  const city = await prisma.city.findFirst({ where: { slug: input.city, isLive: true }, select: { id: true } });
  if (!city) throw new PaymentError("We don't deliver to that city yet", 422);

  const today = nepalNow(now);
  if (input.deliverOn < today.date) throw new PaymentError("Delivery date is in the past", 422);
  const maxDate = new Date(now.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
  if (input.deliverOn > maxDate) throw new PaymentError("Choose a date within the next 60 days", 422);

  // Merge duplicate lines.
  const qty = new Map<string, number>();
  for (const i of input.items) qty.set(i.productId, Math.min(20, (qty.get(i.productId) ?? 0) + i.quantity));

  const products = await prisma.product.findMany({
    where: { id: { in: [...qty.keys()] }, status: "ACTIVE" },
    select: {
      id: true,
      title: true,
      price: { select: { retailMinor: true, sourceOfferId: true } },
      availability: {
        where: { cityId: city.id, isAvailable: true },
        select: { minDeliveryMinutes: true, deliveryFeeMinor: true, sameDayCutoffLocal: true },
      },
    },
  });
  if (products.length !== qty.size) throw new PaymentError("Some items are no longer available", 409);

  const offers = await prisma.vendorOffer.findMany({
    where: { id: { in: products.map((p) => p.price?.sourceOfferId ?? "") } },
    select: { id: true, vendorId: true, baseCostMinor: true },
  });
  const offerById = new Map(offers.map((o) => [o.id, o]));

  let subtotal = 0;
  let deliveryFee = 0;
  const items = products.map((p) => {
    const avail = p.availability[0];
    const offer = p.price ? offerById.get(p.price.sourceOfferId) : undefined;
    if (!p.price || !avail || !offer) throw new PaymentError(`${p.title} can't be delivered there`, 409);
    if (input.deliverOn === today.date) {
      if (avail.minDeliveryMinutes > 360) throw new PaymentError(`${p.title} needs more notice than same day`, 422);
      if (avail.sameDayCutoffLocal && today.time > avail.sameDayCutoffLocal) {
        throw new PaymentError(`Same-day orders for ${p.title} close at ${avail.sameDayCutoffLocal}`, 422);
      }
    }
    const q = qty.get(p.id)!;
    subtotal += p.price.retailMinor * q;
    deliveryFee = Math.max(deliveryFee, avail.deliveryFeeMinor); // one trip per order
    return { productId: p.id, quantity: q, unitRetailMinor: p.price.retailMinor, unitCostMinor: offer.baseCostMinor, vendorId: offer.vendorId };
  });

  return prisma.$transaction(async (tx) => {
    const userId =
      (existingUserId && (await tx.user.findUnique({ where: { id: existingUserId }, select: { id: true } }))?.id) ||
      (await tx.user.create({ data: { name: input.senderName }, select: { id: true } })).id;

    const address = await tx.address.create({
      data: { userId, line1: input.line1, landmark: input.landmark || null, ward: input.ward ?? null, cityId: city.id },
    });

    for (let attempt = 0; ; attempt++) {
      try {
        const order = await tx.order.create({
          data: {
            number: newOrderNumber(),
            userId,
            deliveryAddressId: address.id,
            deliverOn: new Date(`${input.deliverOn}T00:00:00Z`),
            giftMessage: input.giftMessage || null,
            senderName: input.senderName,
            senderContact: input.senderContact,
            recipientName: input.recipientName,
            recipientPhone: input.recipientPhone,
            subtotalMinor: subtotal,
            deliveryFeeMinor: deliveryFee,
            totalMinor: subtotal + deliveryFee,
            items: { create: items },
          },
          select: { id: true, number: true, totalMinor: true },
        });
        return { order, userId };
      } catch (e) {
        if ((e as { code?: string }).code === "P2002" && attempt < 3) continue; // order number collision
        throw e;
      }
    }
  });
}

/** Order as the buyer sees it. Never selects cost or vendor fields. */
export function getOrderForUser(orderId: string, userId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, userId },
    select: {
      id: true,
      number: true,
      status: true,
      deliverOn: true,
      giftMessage: true,
      senderName: true,
      recipientName: true,
      recipientPhone: true,
      subtotalMinor: true,
      deliveryFeeMinor: true,
      totalMinor: true,
      createdAt: true,
      deliveryAddress: { select: { line1: true, landmark: true, ward: true, city: { select: { name: true } } } },
      items: {
        select: {
          id: true,
          quantity: true,
          unitRetailMinor: true,
          product: { select: { title: true, slug: true, category: { select: { slug: true } } } },
        },
      },
      payments: {
        where: { status: "SUCCEEDED" },
        select: { provider: true, amountMinor: true, currency: true, paidAt: true },
        take: 1,
      },
    },
  });
}

export function demoPaymentsEnabled(): boolean {
  return process.env.DEMO_PAYMENTS === "true";
}
