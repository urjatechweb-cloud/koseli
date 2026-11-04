---
title: Payments and settlement (Fonepay, Stripe)
type: subsystem
created: 2026-11-04
updated: 2026-11-04
sources:
  - code: src/server/payments/settlement.ts
  - code: src/server/payments/fonepay.ts
  - code: src/server/payments/payment-service.ts
  - code: src/server/payments/stripe.ts
  - code: src/app/api/payments/fonepay/qr/route.ts
  - code: src/app/api/payments/fonepay/status/route.ts
  - code: src/app/api/payments/fonepay/return/route.ts
  - code: src/app/api/payments/stripe/intent/route.ts
  - code: src/app/api/payments/stripe/webhook/route.ts
  - code: src/server/auth.ts
  - code: tests/fonepay.test.ts
  - code: tests/stripe.test.ts
  - code: tests/settlement.db.test.ts
  - code: src/app/api/payments/demo/route.ts
verified_at: 4628ba6
---

# Payments and settlement

Every gateway creates a `Payment` row with our own `reference` before it calls out. It
then settles through two shared functions in `src/server/payments/settlement.ts`:
`markSucceeded` (`:27`) and `markFailed` (`:59`). Gateways differ only in how they prove
that money moved. The FX quote that diaspora card payments start from is described in
[[pricing-and-fx]].

| Gateway | Who uses it | Start | Proof of payment |
|---|---|---|---|
| Fonepay dynamic QR | Buyers in Nepal | `POST /api/payments/fonepay/qr` | Client polls `/status`, which asks Fonepay `thirdPartyDynamicQrGetStatus` |
| Fonepay web | Buyers in Nepal | `POST /api/payments/fonepay/qr` with `mode:"web"` | Browser returns to `/return`: check the DV signature, then call `verificationMerchant` server to server |
| Stripe | Diaspora | `POST /api/payments/stripe/intent {quoteId}` | Signed webhook at `/api/payments/stripe/webhook` |

## Invariants

- **The amount comes from the database.** Fonepay reads `Order.totalMinor`
  (`src/server/payments/payment-service.ts:17`). Stripe reads `FxQuote.foreignMinor`
  (`src/server/payments/stripe.ts:20`). Neither route accepts an amount from the client.
- **Settlement happens once.** `markSucceeded` flips a payment with a conditional
  `updateMany` on status `INITIATED`/`PENDING` (`src/server/payments/settlement.ts:29`). It flips the order
  the same way (`:43`). Concurrent callers race safely: QR poll, the Fonepay return and
  Stripe retries.
- **A double payment is flagged, never absorbed.** If the payment flips but the order was
  already `PAID`, the payment gets `failureReason = DUPLICATE_REFUND_REQUIRED` (`:50`).
  No refund is issued automatically yet.
- **Payment references** come from `newReference()`: `KS` + time + random hex
  (`src/server/payments/settlement.ts:15`). They contain no commas, because Fonepay signs them inside a CSV
  string.

> ⚠️ Never call `markFailed` on an **untrusted** Fonepay return. `/return` is public, so
> anyone can hit it with a guessed PRN and a bad DV. `verifyWebReturn` labels those
> `trusted:false` (`src/server/payments/fonepay.ts:166-170`), and the caller only logs
> them (`src/server/payments/payment-service.ts:124`). Otherwise anyone could cancel other people's pending
> payments.

> ⚠️ When Fonepay's server-to-server verification fails, the payment stays `PENDING`
> (`trusted:false`, `src/server/payments/fonepay.ts:190`). Money may still have moved. A reconciliation job
> has to re-check it, and that job does not exist yet.

> ⚠️ Stripe `payment_intent.payment_failed` is **not terminal**. The buyer can retry
> another card on the same intent. `decideStripeAction` returns `note` for it
> (`src/server/payments/stripe.ts:95`): the reason is recorded and the status stays `PENDING`. Only
> `canceled` is terminal. Marking a decline `FAILED` means a later success can never
> settle, because `markSucceeded` only flips `INITIATED`/`PENDING`.

> ⚠️ The Stripe webhook must read the body raw (`await req.text()`). Re-serialised JSON
> breaks `constructEvent` (`src/server/payments/stripe.ts:111`).

> ⚠️ Webhook dedupe uses `WebhookEvent(provider, eventId)`. A row without `processedAt`
> means an earlier attempt crashed. It is reprocessed rather than skipped, which is safe
> only because settlement is idempotent. Keep it idempotent.

> ⚠️ Every Fonepay field order (`*_DV_FIELDS`, `src/server/payments/fonepay.ts:107-109`, `:202-203`) and
> every endpoint path comes from the commonly published integration pattern. None is
> checked against Fonepay's official merchant spec (unverified). Diff them against the
> PDF Fonepay issues before going live.

> ⚠️ Payment routes identify the buyer only through the signed guest-session cookie
> (`src/server/auth.ts`, see [[storefront]]). Never accept a user id or an amount from the
> request body. The public exceptions are the Fonepay `/return` and the Stripe webhook,
> which are trusted through gateway signatures instead.

> ⚠️ `POST /api/payments/demo` marks an order paid without charging anyone. It refuses
> unless `DEMO_PAYMENTS=true` (`src/app/api/payments/demo/route.ts`). Never set that on a
> site customers can reach.

## Tests

- `tests/fonepay.test.ts`: signing, tampered returns, signed declines, the QR body.
- `tests/stripe.test.ts`: real Stripe-signed events through `decideStripeAction`.
- `tests/settlement.db.test.ts`: the full webhook-to-DB path covering decline then
  success, a duplicate event, a double payment and a forged signature. It runs only when
  `TEST_DATABASE_URL` is set.

## Not built yet

eSewa, Khalti, PayPal, a refund API for flagged duplicates, a reconciliation cron for
stuck `PENDING` payments, and an outbox for fulfilment notifications (TODO at
`src/server/payments/settlement.ts`).
