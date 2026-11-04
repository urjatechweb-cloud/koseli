import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { decideStripeAction } from "@/server/payments/stripe";

const s = new Stripe("sk_test_dummy");
const secret = "whsec_test_secret";

function signedEvent(type: string, pi: Record<string, unknown>) {
  const payload = JSON.stringify({ id: "evt_1", object: "event", type, data: { object: { object: "payment_intent", ...pi } } });
  const header = s.webhooks.generateTestHeaderString({ payload, secret });
  return s.webhooks.constructEvent(payload, header, secret);
}

const payment = { reference: "KSREF1", amountMinor: 1343, currency: "USD", providerTxnId: "pi_1" };

describe("stripe webhook decisions", () => {
  it("rejects a forged signature", () => {
    const payload = JSON.stringify({ id: "evt_x", type: "payment_intent.succeeded", data: { object: {} } });
    const header = s.webhooks.generateTestHeaderString({ payload, secret: "whsec_attacker" });
    expect(() => s.webhooks.constructEvent(payload, header, secret)).toThrow();
  });
  it("settles a matching success", () => {
    const e = signedEvent("payment_intent.succeeded", { id: "pi_1", amount_received: 1343, currency: "usd" });
    expect(decideStripeAction(e, payment)).toEqual({ kind: "succeed", reference: "KSREF1", providerTxnId: "pi_1" });
  });
  it("fails on amount or currency mismatch", () => {
    expect(decideStripeAction(signedEvent("payment_intent.succeeded", { id: "pi_1", amount_received: 100, currency: "usd" }), payment).kind).toBe("fail");
    expect(decideStripeAction(signedEvent("payment_intent.succeeded", { id: "pi_1", amount_received: 1343, currency: "aud" }), payment).kind).toBe("fail");
  });
  it("treats payment_failed as non-terminal (buyer may retry)", () => {
    const e = signedEvent("payment_intent.payment_failed", { id: "pi_1", last_payment_error: { message: "card declined" } });
    expect(decideStripeAction(e, payment)).toEqual({ kind: "note", reference: "KSREF1", reason: "card declined" });
  });
  it("cancel is terminal", () => {
    expect(decideStripeAction(signedEvent("payment_intent.canceled", { id: "pi_1", cancellation_reason: "abandoned" }), payment).kind).toBe("fail");
  });
  it("ignores unknown payments, other intents, other event types", () => {
    const ok = signedEvent("payment_intent.succeeded", { id: "pi_1", amount_received: 1343, currency: "usd" });
    expect(decideStripeAction(ok, null).kind).toBe("ignore");
    expect(decideStripeAction(signedEvent("payment_intent.succeeded", { id: "pi_OTHER", amount_received: 1343, currency: "usd" }), payment).kind).toBe("ignore");
    expect(decideStripeAction(signedEvent("charge.refunded", {}), payment).kind).toBe("ignore");
  });
});
