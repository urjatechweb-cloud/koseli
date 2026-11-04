/**
 * DB integration: runs only when TEST_DATABASE_URL is set (CI service container).
 *   TEST_DATABASE_URL=postgresql://... npx vitest run tests/settlement.db.test.ts
 */
import { beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("stripe webhook -> settlement (real Postgres)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let handleStripeWebhook: typeof import("@/server/payments/stripe").handleStripeWebhook;
  let quoteOrder: typeof import("@/server/fx/fx-service").quoteOrder;
  const s = new Stripe("sk_test_dummy");
  const secret = "whsec_integration";
  let userId = "", orderId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    process.env.FX_MANUAL_RATES = '{"USD":"133.50"}';
    ({ prisma } = await import("@/lib/prisma"));
    ({ handleStripeWebhook } = await import("@/server/payments/stripe"));
    ({ quoteOrder } = await import("@/server/fx/fx-service"));
    const u = await prisma.user.create({ data: { email: `t${Date.now()}@koseli.test`, countryCode: "US", preferredCurrency: "USD" } });
    userId = u.id;
    const o = await prisma.order.create({ data: { number: `KS-T${Date.now()}`, userId, subtotalMinor: 174_000, totalMinor: 174_000 } });
    orderId = o.id;
  });

  const deliver = (id: string, type: string, pi: Record<string, unknown>) => {
    const payload = JSON.stringify({ id, object: "event", type, data: { object: { object: "payment_intent", ...pi } } });
    return handleStripeWebhook(payload, s.webhooks.generateTestHeaderString({ payload, secret }));
  };

  it("quotes, settles once, dedupes, and flags a double payment", async () => {
    const q = await quoteOrder(orderId, userId, "USD");
    expect(q!.foreignMinor).toBe(1343); // Rs 1740 @133.50 +3%

    const mk = (ref: string, pi: string) => prisma.payment.create({ data: {
      orderId, provider: "STRIPE", status: "PENDING", reference: ref, amountMinor: q!.foreignMinor,
      currency: "USD", settlementNprMinor: 174_000, fxQuoteId: q!.id, providerTxnId: pi } });
    const r1 = `KSIT${Date.now()}A`, r2 = `KSIT${Date.now()}B`;
    await mk(r1, `pi_${r1}`); await mk(r2, `pi_${r2}`);

    // declined first, then success on the same intent
    await deliver(`evt_${r1}_f`, "payment_intent.payment_failed", { id: `pi_${r1}`, metadata: { paymentReference: r1 }, last_payment_error: { message: "card declined" } });
    expect((await prisma.payment.findUniqueOrThrow({ where: { reference: r1 } })).status).toBe("PENDING");

    const ok = { id: `pi_${r1}`, amount_received: 1343, currency: "usd", metadata: { paymentReference: r1 } };
    expect(await deliver(`evt_${r1}_s`, "payment_intent.succeeded", ok)).toMatchObject({ action: "succeed" });
    expect(await deliver(`evt_${r1}_s`, "payment_intent.succeeded", ok)).toMatchObject({ duplicate: true });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PAID");

    // second tab also paid
    await deliver(`evt_${r2}_s`, "payment_intent.succeeded", { id: `pi_${r2}`, amount_received: 1343, currency: "usd", metadata: { paymentReference: r2 } });
    const p2 = await prisma.payment.findUniqueOrThrow({ where: { reference: r2 } });
    expect(p2.status).toBe("SUCCEEDED");
    expect(p2.failureReason).toBe("DUPLICATE_REFUND_REQUIRED");

    // forged event changes nothing
    await expect(handleStripeWebhook(JSON.stringify({ id: "evt_forged" }), "t=1,v1=deadbeef")).rejects.toThrow(/signature/);
  });
});
