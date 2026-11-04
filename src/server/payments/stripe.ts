import "server-only";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { markFailed, markSucceeded, newReference, PaymentError } from "./settlement";

let client: Stripe | undefined;
export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Missing env STRIPE_SECRET_KEY");
    client = new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000, appInfo: { name: "Koseli" } });
  }
  return client;
}

/**
 * Start a card / Apple Pay / Google Pay payment from a locked FX quote.
 * The charge amount comes from the quote row in our DB, never the client.
 */
export async function createIntentFromQuote(quoteId: string, userId: string) {
  const quote = await prisma.fxQuote.findFirst({
    where: { id: quoteId, order: { userId } },
    include: { order: { select: { id: true, number: true, status: true, totalMinor: true } } },
  });
  if (!quote) throw new PaymentError("quote not found", 404);
  if (quote.expiresAt < new Date()) throw new PaymentError("quote expired — request a new one", 410);
  if (quote.order.status !== "PENDING_PAYMENT") throw new PaymentError(`order is ${quote.order.status}`, 409);
  if (quote.order.totalMinor !== quote.nprMinor) throw new PaymentError("order changed since quote — request a new one", 409);

  const reference = newReference();
  await prisma.payment.create({
    data: {
      orderId: quote.orderId,
      provider: "STRIPE",
      status: "INITIATED",
      reference,
      amountMinor: quote.foreignMinor,
      currency: quote.currency,
      settlementNprMinor: quote.nprMinor,
      fxRate: quote.rate,
      fxQuoteId: quote.id,
      expiresAt: quote.expiresAt,
    },
  });

  try {
    const pi = await stripe().paymentIntents.create(
      {
        amount: quote.foreignMinor,
        currency: quote.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true }, // cards + Apple Pay + Google Pay + Link
        description: `Koseli order ${quote.order.number}`,
        statement_descriptor_suffix: "KOSELI",
        metadata: { paymentReference: reference, orderId: quote.orderId, orderNumber: quote.order.number, nprMinor: String(quote.nprMinor) },
      },
      { idempotencyKey: `pi_${reference}` },
    );
    await prisma.payment.update({ where: { reference }, data: { status: "PENDING", providerTxnId: pi.id } });
    return { reference, clientSecret: pi.client_secret!, amountMinor: quote.foreignMinor, currency: quote.currency };
  } catch (e) {
    await markFailed(reference, `stripe create failed: ${(e as Error).message}`);
    throw e;
  }
}

/** What the webhook should do with a verified event. Pure — unit-tested. */
export type StripeAction =
  | { kind: "succeed"; reference: string; providerTxnId: string }
  | { kind: "fail"; reference: string; reason: string }
  /** Non-terminal: record why, keep PENDING — buyer may retry on the same intent. */
  | { kind: "note"; reference: string; reason: string }
  | { kind: "ignore"; reason: string };

export function decideStripeAction(
  event: Stripe.Event,
  payment: { reference: string; amountMinor: number; currency: string; providerTxnId: string | null } | null,
): StripeAction {
  if (!event.type.startsWith("payment_intent.")) return { kind: "ignore", reason: `unhandled ${event.type}` };
  const pi = event.data.object as Stripe.PaymentIntent;
  if (!payment) return { kind: "ignore", reason: "no matching payment" };
  if (payment.providerTxnId && payment.providerTxnId !== pi.id) return { kind: "ignore", reason: "intent id mismatch" };

  switch (event.type) {
    case "payment_intent.succeeded": {
      if (pi.currency !== payment.currency.toLowerCase() || pi.amount_received !== payment.amountMinor) {
        return {
          kind: "fail",
          reference: payment.reference,
          reason: `amount mismatch: got ${pi.amount_received} ${pi.currency}, expected ${payment.amountMinor} ${payment.currency}`,
        };
      }
      return { kind: "succeed", reference: payment.reference, providerTxnId: pi.id };
    }
    case "payment_intent.payment_failed":
      return { kind: "note", reference: payment.reference, reason: pi.last_payment_error?.message ?? "payment failed" };
    case "payment_intent.canceled":
      return { kind: "fail", reference: payment.reference, reason: `canceled: ${pi.cancellation_reason ?? "unknown"}` };
    default:
      return { kind: "ignore", reason: `unhandled ${event.type}` };
  }
}

/** Verify signature, dedupe, act. Throws on bad signature (route returns 400). */
export async function handleStripeWebhook(rawBody: string, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing env STRIPE_WEBHOOK_SECRET");
  if (!signature) throw new PaymentError("missing signature", 400);

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new PaymentError("bad signature", 400);
  }

  // Dedupe: Stripe retries and may deliver an event more than once.
  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: "STRIPE", eventId: event.id } },
    select: { processedAt: true },
  });
  if (existing?.processedAt) return { duplicate: true };
  if (!existing) {
    await prisma.webhookEvent
      .create({ data: { provider: "STRIPE", eventId: event.id, type: event.type, payload: event as unknown as object } })
      .catch((e: { code?: string }) => {
        if (e.code !== "P2002") throw e; // concurrent delivery — settle is idempotent, carry on
      });
  }

  const reference = (event.data.object as { metadata?: Record<string, string> }).metadata?.paymentReference ?? null;
  const payment = reference
    ? await prisma.payment.findFirst({
        where: { reference, provider: "STRIPE" },
        select: { reference: true, amountMinor: true, currency: true, providerTxnId: true },
      })
    : null;

  const action = decideStripeAction(event, payment);
  if (action.kind === "succeed") await markSucceeded(action.reference, action.providerTxnId, { stripeEvent: event.id });
  if (action.kind === "fail") await markFailed(action.reference, action.reason, { stripeEvent: event.id });
  if (action.kind === "note") {
    await prisma.payment.updateMany({
      where: { reference: action.reference, status: { in: ["INITIATED", "PENDING"] } },
      data: { failureReason: action.reason.slice(0, 500) },
    });
  }

  await prisma.webhookEvent.update({
    where: { provider_eventId: { provider: "STRIPE", eventId: event.id } },
    data: { processedAt: new Date(), error: action.kind === "ignore" ? action.reason : null },
  });
  return { duplicate: false, action: action.kind };
}
