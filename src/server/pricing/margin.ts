/**
 * The Margin Engine — pure, integer-only price math.
 *
 * Everything here is in MINOR units (paisa). No floats touch money: the markup
 * is expressed in basis points (2000 = 20%) and all division is done with
 * explicit ceiling so we never under-charge by a rounding error.
 *
 * This module is framework-free so it can be unit-tested and shared with the
 * Expo app or ingestion workers.
 */

export type MarkupStrategy = "MARKUP_ON_COST" | "MARGIN_ON_PRICE";
export type RuleScope = "GLOBAL" | "CATEGORY" | "VENDOR" | "VENDOR_CATEGORY" | "PRODUCT";

export interface MarginRule {
  id: string;
  scope: RuleScope;
  strategy: MarkupStrategy;
  basisPoints: number; // 2000 = 20%
  roundToMinor: number; // 100 = round up to nearest NPR 1
  minProfitMinor: number;
  categoryId: string | null;
  vendorId: string | null;
  productId: string | null;
  isActive: boolean;
  validFrom: Date;
  validTo: Date | null;
}

export interface PriceTarget {
  productId: string;
  categoryId: string;
  vendorId: string;
}

const BPS = 10_000n;

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

function assertMinorInt(n: number, label: string): void {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer (minor units), got ${n}`);
  }
}

/**
 * Compute retail price from base cost.
 *
 *  MARKUP_ON_COST : retail = cost × (1 + bps)      (20% → cost 1000 ⇒ 1200; gross margin 16.67%)
 *  MARGIN_ON_PRICE: retail = cost ÷ (1 − bps)      (20% → cost 1000 ⇒ 1250; gross margin 20.00%)
 *
 * Then: enforce minimum absolute profit, then round UP to `roundToMinor`.
 */
export function computeRetail(baseCostMinor: number, rule: Pick<MarginRule, "strategy" | "basisPoints" | "roundToMinor" | "minProfitMinor">): number {
  assertMinorInt(baseCostMinor, "baseCostMinor");
  assertMinorInt(rule.roundToMinor, "roundToMinor");
  assertMinorInt(rule.minProfitMinor, "minProfitMinor");
  if (!Number.isInteger(rule.basisPoints) || rule.basisPoints < 0 || rule.basisPoints >= 10_000) {
    throw new RangeError(`basisPoints must be an integer in [0, 10000), got ${rule.basisPoints}`);
  }

  const cost = BigInt(baseCostMinor);
  const bps = BigInt(rule.basisPoints);

  let retail =
    rule.strategy === "MARKUP_ON_COST"
      ? ceilDiv(cost * (BPS + bps), BPS)
      : ceilDiv(cost * BPS, BPS - bps);

  const floor = cost + BigInt(rule.minProfitMinor);
  if (retail < floor) retail = floor;

  const step = BigInt(Math.max(1, rule.roundToMinor));
  retail = ceilDiv(retail, step) * step;

  const out = Number(retail);
  if (!Number.isSafeInteger(out)) throw new RangeError("retail overflow");
  return out;
}

const SPECIFICITY: Record<RuleScope, number> = {
  PRODUCT: 5,
  VENDOR_CATEGORY: 4,
  VENDOR: 3,
  CATEGORY: 2,
  GLOBAL: 1,
};

function ruleMatches(rule: MarginRule, t: PriceTarget, now: Date): boolean {
  if (!rule.isActive) return false;
  if (rule.validFrom > now) return false;
  if (rule.validTo && rule.validTo <= now) return false;
  switch (rule.scope) {
    case "PRODUCT":
      return rule.productId === t.productId;
    case "VENDOR_CATEGORY":
      return rule.vendorId === t.vendorId && rule.categoryId === t.categoryId;
    case "VENDOR":
      return rule.vendorId === t.vendorId;
    case "CATEGORY":
      return rule.categoryId === t.categoryId;
    case "GLOBAL":
      return true;
  }
}

/** Pick the most specific active rule; ties broken by most recent validFrom. */
export function resolveRule(rules: readonly MarginRule[], target: PriceTarget, now = new Date()): MarginRule {
  let best: MarginRule | undefined;
  for (const r of rules) {
    if (!ruleMatches(r, target, now)) continue;
    if (
      !best ||
      SPECIFICITY[r.scope] > SPECIFICITY[best.scope] ||
      (SPECIFICITY[r.scope] === SPECIFICITY[best.scope] && r.validFrom > best.validFrom)
    ) {
      best = r;
    }
  }
  if (!best) throw new Error("No active GLOBAL pricing rule — seed one (2000 bps) before ingesting prices.");
  return best;
}

/** Format paisa as "Rs. 1,250" (or "Rs. 1,250.50"). Display-only. */
export function formatNpr(minor: number, locale: "en-NP" | "ne-NP" = "en-NP"): string {
  const rupees = minor / 100;
  const fmt = new Intl.NumberFormat(locale === "ne-NP" ? "ne-NP" : "en-IN", {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `Rs. ${fmt.format(rupees)}`;
}
