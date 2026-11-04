/**
 * FX math — integer-only, like the margin engine.
 *
 * Rates are carried as BigInt scaled by 10^8 ("NPR per 1 unit of foreign
 * currency"), parsed straight from decimal strings so no float ever touches a
 * rate or an amount. Conversions round UP so a diaspora buyer's charge always
 * covers the NPR order total.
 */

export type CurrencyCode =
  | "NPR" | "USD" | "AUD" | "GBP" | "EUR" | "CAD" | "INR" | "JPY" | "KRW" | "AED" | "QAR" | "SAR";

/** Decimal places of each currency's minor unit (ISO 4217). */
export const MINOR_DIGITS: Record<CurrencyCode, number> = {
  NPR: 2, USD: 2, AUD: 2, GBP: 2, EUR: 2, CAD: 2, INR: 2, JPY: 0, KRW: 0, AED: 2, QAR: 2, SAR: 2,
};

export const RATE_SCALE_DIGITS = 8;
const RATE_SCALE = 10n ** BigInt(RATE_SCALE_DIGITS);
const BPS = 10_000n;

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

/** "133.215" -> 13321500000n (×10^8). Rejects negatives, exponents, junk. */
export function parseRate(s: string): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s.trim());
  if (!m) throw new RangeError(`bad rate "${s}"`);
  const frac = (m[2] ?? "").slice(0, RATE_SCALE_DIGITS).padEnd(RATE_SCALE_DIGITS, "0");
  const v = BigInt(m[1]!) * RATE_SCALE + BigInt(frac);
  if (v <= 0n) throw new RangeError("rate must be positive");
  return v;
}

/** NRB quotes some currencies per 100 or per 10 units (e.g. INR, JPY). Normalize to per-1. */
export function perUnit(rateScaled: bigint, unit: number): bigint {
  if (!Number.isInteger(unit) || unit <= 0) throw new RangeError(`bad unit ${unit}`);
  return rateScaled / BigInt(unit);
}

export function formatRate(rateScaled: bigint): string {
  const whole = rateScaled / RATE_SCALE;
  const frac = (rateScaled % RATE_SCALE).toString().padStart(RATE_SCALE_DIGITS, "0");
  return `${whole}.${frac}`;
}

/**
 * NPR (paisa) -> foreign minor units, rounded up, with a buffer.
 *
 *   foreign = npr / rate × (1 + buffer)
 *
 * The buffer covers the card processor's cross-border + conversion fees and
 * rate drift between quote and settlement. 300 bps = 3%.
 */
export function nprToForeignMinor(nprMinor: number, currency: CurrencyCode, rateScaled: bigint, bufferBps: number): number {
  if (!Number.isSafeInteger(nprMinor) || nprMinor <= 0) throw new RangeError(`bad nprMinor ${nprMinor}`);
  if (!Number.isInteger(bufferBps) || bufferBps < 0 || bufferBps > 2000) throw new RangeError(`bad bufferBps ${bufferBps}`);
  if (rateScaled <= 0n) throw new RangeError("rate must be positive");
  const d = 10n ** BigInt(MINOR_DIGITS[currency]);
  const nprDigits = 10n ** BigInt(MINOR_DIGITS.NPR);
  const num = BigInt(nprMinor) * RATE_SCALE * d * (BPS + BigInt(bufferBps));
  const den = rateScaled * nprDigits * BPS;
  const out = Number(ceilDiv(num, den));
  if (!Number.isSafeInteger(out) || out <= 0) throw new RangeError("conversion overflow");
  return out;
}

/** Foreign minor -> NPR paisa at the raw rate (no buffer), rounded down. For reporting. */
export function foreignMinorToNpr(foreignMinor: number, currency: CurrencyCode, rateScaled: bigint): number {
  const d = 10n ** BigInt(MINOR_DIGITS[currency]);
  return Number((BigInt(foreignMinor) * rateScaled * 100n) / (d * RATE_SCALE));
}

export function formatMoney(minor: number, currency: CurrencyCode, locale = "en-US"): string {
  const digits = MINOR_DIGITS[currency];
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(minor / 10 ** digits);
}
