# Koseli (कोसेली) — platform foundation

Koseli: the gift you bring home. Gifting + services platform for Nepal and the Nepali diaspora. This slice contains:

| Area | Files |
|---|---|
| Database schema (User, Catalog, Pricing, Orders, Payments) | `prisma/schema.prisma`, `prisma/migrations/` |
| 20% margin engine (pure math) | `src/server/pricing/margin.ts` |
| Price ingestion middleware (cost → retail, atomic) | `src/server/pricing/pricing-service.ts` |
| Fonepay client (web redirect + dynamic QR) | `src/server/payments/fonepay.ts` |
| Payment orchestration (idempotent settle) | `src/server/payments/payment-service.ts` |
| API routes | `src/app/api/payments/fonepay/{qr,status,return}/route.ts` |
| FX engine: NRB rates, 15-min price locks | `src/server/fx/{fx,rate-providers,fx-service}.ts` |
| Stripe (cards, Apple Pay, Google Pay) | `src/server/payments/stripe.ts`, `src/app/api/payments/stripe/{intent,webhook}` |
| Shared settlement (all gateways) | `src/server/payments/settlement.ts` |
| Pokhara beta seed | `prisma/seed.ts` |
| Tests | `tests/*.test.ts` |

## Setup (Next.js 14 + Prisma + Postgres)

Requirements: Node 20+ and Postgres 15+ (local, Docker, or Supabase).

```bash
npm install
```

```bash
cp .env.example .env
```

Local Postgres via Docker:

```bash
docker run -d --name koseli-db -p 5432:5432 -e POSTGRES_USER=koseli -e POSTGRES_PASSWORD=koseli -e POSTGRES_DB=koseli postgres:16
```

```bash
npx prisma migrate dev
```

```bash
npx prisma db seed
```

```bash
npm run dev
```

Checks:

```bash
npm test && npm run typecheck && npm run build
```

### Supabase

Set `DATABASE_URL` to the **pooled** connection string (port 6543, add `?pgbouncer=true`) and `DIRECT_URL` to the **direct** connection string (port 5432). Migrations use `DIRECT_URL`; the app uses the pooler. Run `npx prisma migrate deploy` in CI, never `migrate dev`.

### Adding the UI layer (next step)

```bash
npx shadcn@latest init
```

Then Tailwind theme tokens, tRPC (`@trpc/server`, `@trpc/client`, `@trpc/react-query`), and Auth.js. Public tRPC procedures must select products with `publicProductSelect` from `pricing-service.ts`. That allow-list is what keeps vendor cost out of API responses.

## Try the store locally

After the setup steps above, put these in `.env`:

```
SESSION_SECRET="any-random-string-of-32-or-more-characters"
DEMO_PAYMENTS="true"
```

```bash
npm run dev
```

Open http://localhost:3000 and walk the buyer journey: pick a gift, add it to the cart,
check out, then use the **Demo** tab to mark the order paid. The Fonepay and card tabs
show a "not connected yet" message until their keys are set. Never set `DEMO_PAYMENTS`
on a site that customers can reach.

## Money and margin rules

* All money is an integer in paisa. There are no floats anywhere in the price path.
* **"20%" can mean two things.** The seed uses `MARKUP_ON_COST` with 2000 bps: cost Rs 1,000 sells for Rs 1,200, which is a **16.7% gross margin**. If you want 20% of the *sale price* to be profit, switch the global rule to `MARGIN_ON_PRICE`: Rs 1,000 then sells for Rs 1,250.
* Retail is rounded **up** to `roundToMinor` (the seed uses NPR 10), so rounding never eats into margin.
* Rule precedence is PRODUCT > VENDOR_CATEGORY > VENDOR > CATEGORY > GLOBAL. Each run writes an entry to `PriceHistory`.
* Vendor cost exists only in `VendorOffer`. The storefront reads `ProductPrice`.

## Fonepay flow

```
Client ──POST /api/payments/fonepay/qr {orderId}──▶ server loads order total from DB (never from client)
                                                   ├─ creates Payment(PRN, PENDING)
                                                   ├─ Fonepay thirdPartyDynamicQrDownload (HMAC-SHA512 signed)
                                                   └─ returns QR as data URL + PRN
Client polls GET /api/payments/fonepay/status?prn=  ─▶ thirdPartyDynamicQrGetStatus → idempotent settle → Order PAID

mode:"web" → redirectUrl to Fonepay → browser returns to /api/payments/fonepay/return
           → verify DV signature → server-to-server verificationMerchant → check amount == stored amount → settle
```

Security properties covered by the tests:
* A forged or tampered return URL is ignored (`trusted:false`). It does not change payment state, so an attacker can't cancel someone else's payment.
* Settlement uses a conditional `updateMany`, so a QR poll, websocket and return URL racing each other flip the order exactly once.
* An amount mismatch between Fonepay and the stored payment fails the payment.

**Before go-live:** Fonepay sends the authoritative integration PDF privately when you onboard as a merchant. Diff the `*_DV_FIELDS` arrays and the endpoint paths in `fonepay.ts` against it, then run a real transaction on Fonepay's dev environment. The field orders in this repo follow the commonly published integration pattern and have **not** been checked against an official Fonepay spec.

## Diaspora checkout (Stripe + FX)

```
POST /api/fx/quote {orderId, currency:"USD"}   -> locks a price for 15 min: Rs 1,740 -> USD 13.43
POST /api/payments/stripe/intent {quoteId}     -> clientSecret for Stripe Payment Element (Apple/Google Pay = one tap)
Stripe -> POST /api/payments/stripe/webhook    -> verify signature -> dedupe event -> check amount+currency -> settle
GET  /api/cron/fx (daily, vercel.json)         -> refresh NRB rates
```

* **Rates:** Nepal Rastra Bank **buy** rate. That is the NPR you actually realize when foreign money is remitted in. Rates are normalized for currencies NRB quotes per 10 or per 100 units (JPY, INR). `FX_MANUAL_RATES` overrides the feed during an outage. Quoting stops if the rate is more than 72 hours old.
* **Buffer:** `FX_BUFFER_BPS` (default 3%) is added to the foreign price to cover card FX and cross-border fees. Conversions round up, so the charge always covers the NPR total.
* **Webhook rules:**
  * `payment_failed` does not end the payment. The buyer can retry on the same intent.
  * Only `canceled` is terminal.
  * Events are deduplicated in `WebhookEvent`.
  * A second successful payment on an order that's already paid is marked `DUPLICATE_REFUND_REQUIRED`.
* **Local webhook testing:** `stripe listen --forward-to localhost:3000/api/payments/stripe/webhook`
* **DB integration test:** `TEST_DATABASE_URL=postgresql://... npx vitest run tests/settlement.db.test.ts`

**Business blocker before Stripe goes live:** as far as I know, Stripe does not onboard businesses registered in Nepal. Charging cards needs a Stripe account held by a company registered abroad (US, UK, AU or SG), plus a compliant way to bring the funds home under NRB foreign-exchange rules. This is a legal and banking decision, not a code one. Confirm it with Stripe and a Nepali FX lawyer.

## Known gaps (next phases)

* `src/server/auth.ts` deliberately fails closed with a 501. Wire up Auth.js or Clerk to enable the payment routes.
* Reconciliation cron: re-check payments stuck in `PENDING` past `expiresAt` and web payments whose verification call timed out.
* Outbox and queue for fulfilment notifications (marked TODO in `markSucceeded`).
* eSewa, Khalti, PayPal adapters, Stripe refunds API for `DUPLICATE_REFUND_REQUIRED`, Algolia indexer, services/booking schema, Expo app, Dockerfile and GitHub Actions.
