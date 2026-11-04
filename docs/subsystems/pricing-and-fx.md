---
title: Pricing (20% margin engine) and FX quotes
type: subsystem
created: 2026-11-04
updated: 2026-11-04
sources:
  - code: src/server/pricing/margin.ts
  - code: src/server/pricing/pricing-service.ts
  - code: src/server/fx/fx.ts
  - code: src/server/fx/rate-providers.ts
  - code: src/server/fx/fx-service.ts
  - code: src/app/api/fx/quote/route.ts
  - code: src/app/api/cron/fx/route.ts
  - code: prisma/schema.prisma
  - code: prisma/seed.ts
  - code: tests/margin.test.ts
  - code: tests/fx.test.ts
verified_at: dc565b5
---

# Pricing and FX

Money always moves in two steps, and both use integer arithmetic:

1. **Vendor cost → NPR retail.** The margin engine runs whenever a vendor price is
   ingested.
2. **NPR retail → buyer's currency.** This runs at checkout and only for diaspora buyers.
   It produces a quote that the payment must match exactly (see [[payments]]).

All amounts are integers in minor units (paisa, cents). Rates are `BigInt` scaled by
10^8 and parsed straight from decimal strings (`src/server/fx/fx.ts:25`).

## Margin engine

- `computeRetail` (`src/server/pricing/margin.ts:54`) supports two strategies:
  - `MARKUP_ON_COST`: cost × 1.2 at 2000 bps.
  - `MARGIN_ON_PRICE`: cost ÷ 0.8 at 2000 bps.
- After that it applies the `minProfitMinor` floor, then rounds **up** to `roundToMinor`.
- `resolveRule` (`:108`) picks the most specific active rule:
  PRODUCT > VENDOR_CATEGORY > VENDOR > CATEGORY > GLOBAL.
- `ingestVendorPrice` (`src/server/pricing/pricing-service.ts:21`) does three things in
  one transaction:
  1. Upserts the private `VendorOffer`.
  2. Reprices the product from its cheapest active, in-stock offer, writing
     `ProductPrice` and appending to `PriceHistory`.
  3. Bumps `searchVersion` so the search index picks up the change.
- The seed creates one GLOBAL rule: `MARKUP_ON_COST`, 2000 bps, rounded to NPR 10
  (`prisma/seed.ts`).

> ⚠️ "20%" is ambiguous. The seeded `MARKUP_ON_COST` gives a **16.7% gross margin**
> (cost 1,000 → retail 1,200). A 20% margin on the sale price needs `MARGIN_ON_PRICE`
> (cost 1,000 → retail 1,250). The owner has not decided yet.

> ⚠️ Vendor cost lives only in `VendorOffer.baseCostMinor`. Customer-facing queries must
> use the `publicProductSelect` allow-list (`src/server/pricing/pricing-service.ts`), never `include` on
> offers. Adding a field to that select is how cost would leak.

> ⚠️ `src/server/pricing/pricing-service.ts` imports `server-only`, so it cannot run in `tsx` scripts or the
> seed. The seed calls the pure `computeRetail` directly. Tests alias `server-only` to a
> stub (`vitest.config.ts`).

## FX

- **Rates.** Nepal Rastra Bank's **buy** rate: the NPR we realise when foreign money is
  remitted in. A manual override (`FX_MANUAL_RATES`) is tried first
  (`src/server/fx/fx-service.ts:31`).
- **Freshness.**
  - Rates are refreshed when older than 26 hours.
  - Quoting is refused when they are older than 72 hours (`src/server/fx/fx-service.ts:11-12`).
  - A daily refresh runs as a Vercel Cron job at `/api/cron/fx` (see `vercel.json`).
    The route checks a `CRON_SECRET` bearer token.
- **Quote.** `quoteOrder` (`src/server/fx/fx-service.ts:63`) locks `foreignMinor` for 15 minutes.
  - `nprToForeignMinor` (`src/server/fx/fx.ts:54`) divides by the rate, adds `FX_BUFFER_BPS` (default
    300 = 3%) and rounds up, so the charge always covers the NPR total.
  - Zero-decimal currencies (JPY, KRW) are handled through `MINOR_DIGITS`.

> ⚠️ NRB quotes some currencies per 10 or per 100 units, JPY and INR among them. Always
> pass the rate through `perUnit` (`src/server/fx/rate-providers.ts:63`). Skip it and a
> yen price comes out 10× wrong.

> ⚠️ The NRB response shape in `src/server/fx/rate-providers.ts` is written from memory and has not
> been checked against a live response, because the build sandbox's proxy blocked
> nrb.org.np (unverified). The zod schema rejects any unexpected shape, so a mismatch
> throws instead of mispricing. Check it against one real response.

> ⚠️ A Stripe intent is refused if `Order.totalMinor` no longer equals
> `FxQuote.nprMinor` (`src/server/payments/stripe.ts`). Any cart edit after quoting
> needs a new quote.

> ⚠️ Adding a `Currency` enum value takes a migration. Prisma's `migrate dev` refuses to
> run non-interactively for enum additions. Generate the SQL with `prisma migrate diff
> --from-migrations … --to-schema-datamodel … --script` and apply it with
> `migrate deploy`.
