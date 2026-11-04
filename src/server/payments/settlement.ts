import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Gateway-agnostic settlement. Every provider (Fonepay, Stripe, later eSewa,
 * Khalti, PayPal) settles through these two functions so the invariants live
 * in one place:
 *   - a payment flips to SUCCEEDED at most once (conditional updateMany)
 *   - an order flips to PAID at most once
 *   - a second successful payment on an already-paid order is flagged for refund
 */

/** Payment reference: unique, URL-safe, ≤ 25 chars, no commas (Fonepay signs it in a CSV). */
export function newReference(): string {
  return `KS${Date.now().toString(36).toUpperCase()}${randomBytes(5).toString("hex").toUpperCase()}`;
}

export class PaymentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const DUPLICATE_REFUND_REQUIRED = "DUPLICATE_REFUND_REQUIRED";

export async function markSucceeded(reference: string, providerTxnId: string | null, raw: unknown) {
  return prisma.$transaction(async (tx) => {
    const flipped = await tx.payment.updateMany({
      where: { reference, status: { in: ["INITIATED", "PENDING"] } },
      data: {
        status: "SUCCEEDED",
        paidAt: new Date(),
        rawResponse: raw as object,
        ...(providerTxnId ? { providerTxnId } : {}),
      },
    });
    const payment = await tx.payment.findUniqueOrThrow({
      where: { reference },
      select: { id: true, orderId: true, status: true },
    });
    if (flipped.count === 1) {
      const order = await tx.order.updateMany({
        where: { id: payment.orderId, status: "PENDING_PAYMENT" },
        data: { status: "PAID" },
      });
      if (order.count === 0) {
        // Buyer paid twice (e.g. Fonepay QR and Stripe, or two tabs). Money is in;
        // the order was already paid. Flag for finance — never silently keep it.
        await tx.payment.update({ where: { id: payment.id }, data: { failureReason: DUPLICATE_REFUND_REQUIRED } });
        console.error("[settlement] duplicate payment, refund required", { reference });
      }
      // TODO: enqueue fulfilment + receipt (outbox) here.
    }
    return payment;
  });
}

export async function markFailed(reference: string, reason: string, raw?: unknown) {
  await prisma.payment.updateMany({
    where: { reference, status: { in: ["INITIATED", "PENDING"] } },
    data: { status: "FAILED", failureReason: reason.slice(0, 500), rawResponse: (raw ?? undefined) as object | undefined },
  });
}
