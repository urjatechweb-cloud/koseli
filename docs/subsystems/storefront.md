---
title: Storefront and guest checkout
type: subsystem
created: 2026-11-04
updated: 2026-11-04
sources:
  - code: src/app/layout.tsx
  - code: src/app/page.tsx
  - code: src/app/shop/page.tsx
  - code: src/app/p/[slug]/page.tsx
  - code: src/app/cart/page.tsx
  - code: src/app/checkout/page.tsx
  - code: src/app/orders/[id]/page.tsx
  - code: src/app/api/orders/route.ts
  - code: src/server/catalog.ts
  - code: src/server/orders.ts
  - code: src/server/auth.ts
  - code: src/components/cart.tsx
  - code: src/components/pay-panel.tsx
  - code: src/components/art.tsx
  - code: tests/session.test.ts
verified_at: dc565b5
---

# Storefront and guest checkout

The customer site is built with Next.js 14 App Router and Tailwind. The pages run in this
order:

1. Home and `/shop`. Filters are a plain GET form, so every filtered view has a URL.
2. `/p/[slug]`.
3. `/cart`. The cart lives client-side in `localStorage`.
4. `/checkout`, which posts to `/api/orders`.
5. `/orders/[id]`, where the payment panel appears.

The payment panel has three tabs: Fonepay QR, card from abroad and Demo. Each tab calls
the routes described in [[payments]]. Prices come from [[pricing-and-fx]].

## Guest sessions

The order API sets `ks_session`, a signed httpOnly cookie in the form `userId.exp.hmac`
(HMAC-SHA256 with `SESSION_SECRET`, 30 days; `src/server/auth.ts`). Order pages and
payment routes read the user only from that cookie.

> ⚠️ Checkout creates a **new** guest `User` for every new session and never looks one up
> by phone or email (`src/server/orders.ts`, `createOrder`). The only way to reach an
> account by phone number is [[sign-in]], which first proves the buyer owns the number
> with an SMS code. Never add a phone lookup anywhere else, or anyone could type a
> stranger's number and read their orders.

> ⚠️ The buyer's contact goes on `Order.senderContact`, not on `User.email` or
> `User.phone`. Those columns are unique, and two guest checkouts with the same phone
> number would collide.

## Prices and dates

> ⚠️ The cart's `unitMinor` is for display only. `createOrder` reprices every line from
> `ProductPrice`, takes vendor cost from `VendorOffer` for `OrderItem.unitCostMinor`, and
> charges one delivery fee per order (the highest across its items). The client sends
> only product ids and quantities. zod drops any extra fields.

> ⚠️ Today and same-day cut-offs use **Nepal time (UTC+5:45)** through `nepalNow`, not
> server time. Vercel runs in UTC, and a UTC "today" is wrong for the first 5¾ hours of
> every Nepali day. `Order.deliverOn` is a `DATE` column.

> ⚠️ Import Stripe from `@stripe/stripe-js/pure` (`src/components/pay-panel.tsx`). The
> default entry injects Stripe.js on every page as a side effect of the import.

## Catalogue

- `listProducts` (`src/server/catalog.ts`) only returns products that are ACTIVE, have a
  price and can be delivered to the city. The beta city is fixed to `pokhara`.
- The "Popular" sort puts perishable (same-day) items first until there is sales data.
- Product images are SVG illustrations drawn per category, with per-slug overrides in
  `BY_SLUG` (`src/components/art.tsx`), until vendors supply photos. A new product in an
  existing category gets that category's drawing.

## Not built yet

Nepali-language UI, vendor
photos, the 3D hamper viewer, and the services marketplace (photographers and events).
