# Chino — Phase 0 foundation

Gifting + services platform for Nepal and the diaspora. This slice contains:

| Area | Files |
|---|---|
| Database schema (User, Catalog, Pricing, Orders, Payments) | `prisma/schema.prisma`, `prisma/migrations/` |
| 20% margin engine (pure math) | `src/server/pricing/margin.ts` |
| Price ingestion middleware (cost → retail, atomic) | `src/server/pricing/pricing-service.ts` |
| Fonepay client (web redirect + dynamic QR) | `src/server/payments/fonepay.ts` |
| Payment orchestration (idempotent settle) | `src/server/payments/payment-service.ts` |
| API routes | `src/app/api/payments/fonepay/{qr,status,return}/route.ts` |
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
docker run -d --name chino-db -p 5432:5432 -e POSTGRES_USER=chino -e POSTGRES_PASSWORD=chino -e POSTGRES_DB=chino postgres:16
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

## Known gaps (next phases)

* `src/server/auth.ts` deliberately fails closed with a 501. Wire up Auth.js or Clerk to enable the payment routes.
* Reconciliation cron: re-check payments stuck in `PENDING` past `expiresAt` and web payments whose verification call timed out.
* Outbox and queue for fulfilment notifications (marked TODO in `markSucceeded`).
* eSewa, Khalti, Stripe, PayPal adapters, FX quote locking with `ExchangeRate`, Algolia indexer, services/booking schema, Expo app, Dockerfile and GitHub Actions.
