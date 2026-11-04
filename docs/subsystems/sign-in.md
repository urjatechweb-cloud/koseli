---
title: Phone sign-in (SMS one-time codes)
type: subsystem
created: 2026-11-04
updated: 2026-11-04
sources:
  - code: src/server/otp.ts
  - code: src/server/sms/phone.ts
  - code: src/server/sms/providers.ts
  - code: src/server/auth.ts
  - code: src/app/signin/page.tsx
  - code: src/app/account/page.tsx
  - code: src/app/api/auth/start/route.ts
  - code: src/app/api/auth/verify/route.ts
  - code: src/app/api/auth/signout/route.ts
  - code: tests/otp.db.test.ts
  - code: tests/phone-sms.test.ts
verified_at: dc565b5
---

# Phone sign-in

Buyers sign in with their mobile number and a 6-digit code sent by SMS. There are no
passwords. Signing in sets the same `ks_session` cookie that guest checkout uses (see
[[storefront]]), so every payment route works unchanged (see [[payments]]).

## Flow

1. **Request a code.** `POST /api/auth/start { phone }`
   - `normalizePhone` (`src/server/sms/phone.ts`) turns the number into E.164 format.
   - Rate limits are checked.
   - Any older unused codes for that phone are cancelled.
   - An `OtpChallenge` row is stored with an HMAC of the code, never the code itself.
   - The SMS goes out through Sparrow for `+977` numbers when configured, and through
     Twilio for everything else (`src/server/sms/providers.ts`).
2. **Enter the code.** `POST /api/auth/verify { challengeId, code }`
   - The guess is counted, then checked.
   - The code is consumed so it can't be used again.
   - `resolveAccount` decides which user to sign in, and a fresh cookie is set.
3. **Sign out.** `POST /api/auth/signout` clears the cookie.

How `resolveAccount` (`src/server/otp.ts`) picks the account:

| Situation | Result |
|---|---|
| An account already has this phone, and the browser holds a guest session | Sign into that account. The guest's orders, addresses and recipients move into it, and the guest user gets `deletedAt` |
| No account has this phone, and the browser holds a guest session | The phone is attached to that guest, who becomes a real account |
| The browser is signed into a *different* phone account | Switch accounts. Nothing is merged |
| No session | Create an account |

## Limits

| Limit | Value |
|---|---|
| Code lifetime | 5 minutes |
| Wrong guesses per code | 5. The code locks even if the 6th guess is right |
| Resend gap, same phone | 30 seconds |
| Codes per phone | 3 per 15 minutes, 8 per day |
| Codes per IP address | 10 per hour (stored as an HMAC, not the raw IP) |

> ⚠️ Count the guess **before** comparing it. `verifySignIn` uses a conditional
> `updateMany … attempts < 5` and only then compares the code. If you compare first and
> count afterwards, parallel requests can make far more than 5 guesses;
> `tests/otp.db.test.ts` fires 20 at once.

> ⚠️ Consuming the code is a conditional update on `consumedAt: null`, and only one
> request can win it. Never replace it with a read followed by a write.

> ⚠️ `createdAt` for a challenge is set from the same `now` used by the rate-limit
> checks, not from the database default. Mixing the two clocks broke the resend gap in
> testing.

> ⚠️ Sign-in only accepts mobile numbers in `ALLOWED_COUNTRIES`: Nepal, the Gulf,
> Malaysia, India, Japan, Korea, Australia, the UK and the US/Canada. This blocks SMS
> pumping, where bots send codes to premium-rate numbers and the site pays for every
> message. Add a country deliberately, with its mobile number pattern.

> ⚠️ Every failure says the same thing ("wrong or has expired"), whether the challenge
> doesn't exist, has expired, or the code is wrong, and `start` responds the same way
> whether or not an account exists. Keep it that way, so the site doesn't reveal which
> numbers have accounts.

> ⚠️ The `?next=` redirect after sign-in only accepts paths on this site
> (`safeNext` in `src/app/signin/page.tsx`). `//evil.example` falls back to `/account`.

> ⚠️ `DEMO_OTP=true` shows the code on screen and sends no SMS, so anyone can sign in as
> any phone number. Use it on team previews only. `SMS_PROVIDER=log` is ignored in
> production.

> ⚠️ The Sparrow and Twilio request formats were written from their public docs and have
> not been checked against a live account (unverified). Send one real SMS through each
> before launch.

> ⚠️ The header calls `getCurrentUser` on every page. That function returns signed-out,
> rather than throwing, when `SESSION_SECRET` is missing. Otherwise a missing variable
> would take down every page instead of just sign-in.

## Not built yet

- "Sign out everywhere". The cookie is stateless, so this needs a session version stored
  on `User`.
- Making the rate limits atomic under heavy concurrency. They are count-then-insert, so
  simultaneous requests can slip a few extra codes through.
- Pre-filling checkout for signed-in buyers.
