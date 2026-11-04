import "server-only";
import { prisma } from "@/lib/prisma";
import {
  buildWebPaymentUrl,
  createDynamicQr,
  getQrStatus,
  loadFonepayConfig,
  verifyWebReturn,
} from "./fonepay";
import { markFailed, markSucceeded, PaymentError, newReference } from "./settlement";

export { PaymentError };

const QR_TTL_MS = 10 * 60 * 1000;

/** Load an order the user owns that is still awaiting payment. Amount comes from DB, never the client. */
async function payableOrder(orderId: string, userId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: { id: true, number: true, status: true, totalMinor: true },
  });
  if (!order) throw new PaymentError("order not found", 404);
  if (order.status !== "PENDING_PAYMENT") throw new PaymentError(`order is ${order.status}`, 409);
  if (order.totalMinor <= 0) throw new PaymentError("order total must be positive", 422);
  return order;
}

export async function startFonepayQr(orderId: string, userId: string) {
  const order = await payableOrder(orderId, userId);
  const cfg = loadFonepayConfig();
  const prn = newReference();

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "FONEPAY_QR",
      status: "INITIATED",
      reference: prn,
      amountMinor: order.totalMinor,
      currency: "NPR",
      settlementNprMinor: order.totalMinor,
      expiresAt: new Date(Date.now() + QR_TTL_MS),
    },
  });

  try {
    const qr = await createDynamicQr(cfg, { prn, amountMinor: order.totalMinor, remarks1: order.number });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PENDING", rawResponse: qr.raw as object },
    });
    return { prn, qrMessage: qr.qrMessage, websocketUrl: qr.websocketUrl, expiresAt: payment.expiresAt! };
  } catch (e) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: (e as Error).message.slice(0, 500) },
    });
    throw e;
  }
}

export async function startFonepayWeb(orderId: string, userId: string, appUrl: string) {
  const order = await payableOrder(orderId, userId);
  const cfg = loadFonepayConfig();
  const prn = newReference();
  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "FONEPAY_WEB",
      status: "PENDING",
      reference: prn,
      amountMinor: order.totalMinor,
      currency: "NPR",
      settlementNprMinor: order.totalMinor,
    },
  });
  return buildWebPaymentUrl(cfg, {
    prn,
    amountMinor: order.totalMinor,
    remarks1: order.number,
    returnUrl: new URL("/api/payments/fonepay/return", appUrl).toString(),
  });
}

export async function pollFonepayQr(prn: string, userId: string) {
  const payment = await prisma.payment.findFirst({
    where: { reference: prn, provider: "FONEPAY_QR", order: { userId } },
    select: { status: true, expiresAt: true, orderId: true },
  });
  if (!payment) throw new PaymentError("payment not found", 404);
  if (payment.status === "SUCCEEDED" || payment.status === "FAILED" || payment.status === "EXPIRED") {
    return { status: payment.status, orderId: payment.orderId };
  }

  const { status, raw } = await getQrStatus(loadFonepayConfig(), prn);
  if (status === "success") {
    await markSucceeded(prn, null, raw);
    return { status: "SUCCEEDED" as const, orderId: payment.orderId };
  }
  if (status === "failed") {
    await markFailed(prn, "fonepay reported failed", raw);
    return { status: "FAILED" as const, orderId: payment.orderId };
  }
  if (payment.expiresAt && payment.expiresAt < new Date()) {
    await prisma.payment.updateMany({ where: { reference: prn, status: "PENDING" }, data: { status: "EXPIRED" } });
    return { status: "EXPIRED" as const, orderId: payment.orderId };
  }
  return { status: "PENDING" as const, orderId: payment.orderId };
}

export async function handleFonepayWebReturn(query: URLSearchParams) {
  const prn = query.get("PRN");
  if (!prn) return { ok: false as const, orderId: null };
  const payment = await prisma.payment.findUnique({
    where: { reference: prn },
    select: { amountMinor: true, orderId: true, provider: true, status: true },
  });
  if (!payment || payment.provider !== "FONEPAY_WEB") return { ok: false as const, orderId: null };
  if (payment.status === "SUCCEEDED") return { ok: true as const, orderId: payment.orderId };

  const result = await verifyWebReturn(loadFonepayConfig(), query, payment.amountMinor);
  const raw = Object.fromEntries(query.entries());
  if (!result.ok) {
    if (result.trusted) await markFailed(prn, result.reason, raw);
    else console.warn("[fonepay:return] untrusted callback ignored", { prn, reason: result.reason });
    return { ok: false as const, orderId: payment.orderId };
  }
  if (result.paidMinor !== payment.amountMinor) {
    await markFailed(prn, `amount mismatch: paid ${result.paidMinor}, expected ${payment.amountMinor}`, raw);
    return { ok: false as const, orderId: payment.orderId };
  }
  await markSucceeded(prn, result.uid, raw);
  return { ok: true as const, orderId: payment.orderId };
}
