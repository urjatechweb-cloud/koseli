import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/server/payments/stripe";
import { PaymentError } from "@/server/payments/settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/stripe/webhook
 * Subscribe in the Stripe dashboard to: payment_intent.succeeded,
 * payment_intent.payment_failed, payment_intent.canceled.
 * Body must be read raw — signature verification fails on re-serialized JSON.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  try {
    const result = await handleStripeWebhook(raw, req.headers.get("stripe-signature"));
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    if (e instanceof PaymentError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[stripe:webhook]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 }); // 5xx => Stripe retries
  }
}
