import { describe, expect, it } from "vitest";
import { computeRetail, resolveRule, type MarginRule } from "@/server/pricing/margin";

const base = { roundToMinor: 1, minProfitMinor: 0 };

describe("computeRetail", () => {
  it("20% markup on cost: Rs 1000 -> Rs 1200", () => {
    expect(computeRetail(100_000, { ...base, strategy: "MARKUP_ON_COST", basisPoints: 2000 })).toBe(120_000);
  });
  it("20% margin on price: Rs 1000 -> Rs 1250", () => {
    expect(computeRetail(100_000, { ...base, strategy: "MARGIN_ON_PRICE", basisPoints: 2000 })).toBe(125_000);
  });
  it("never under-charges: rounds fractional paisa up", () => {
    // 333 * 1.2 = 399.6 -> 400
    expect(computeRetail(333, { ...base, strategy: "MARKUP_ON_COST", basisPoints: 2000 })).toBe(400);
  });
  it("rounds up to the configured step (NPR 10)", () => {
    // Rs 1001 * 1.2 = Rs 1201.20 -> Rs 1210
    expect(computeRetail(100_100, { strategy: "MARKUP_ON_COST", basisPoints: 2000, roundToMinor: 1000, minProfitMinor: 0 })).toBe(121_000);
  });
  it("enforces absolute minimum profit", () => {
    // Rs 50 item, 20% = Rs 10 profit, but floor is Rs 40
    expect(computeRetail(5_000, { strategy: "MARKUP_ON_COST", basisPoints: 2000, roundToMinor: 100, minProfitMinor: 4_000 })).toBe(9_000);
  });
  it("rejects floats and negative costs", () => {
    const r = { ...base, strategy: "MARKUP_ON_COST" as const, basisPoints: 2000 };
    expect(() => computeRetail(10.5, r)).toThrow(RangeError);
    expect(() => computeRetail(-1, r)).toThrow(RangeError);
  });
});

describe("resolveRule", () => {
  const mk = (p: Partial<MarginRule>): MarginRule => ({
    id: "x", scope: "GLOBAL", strategy: "MARKUP_ON_COST", basisPoints: 2000, roundToMinor: 100, minProfitMinor: 0,
    categoryId: null, vendorId: null, productId: null, isActive: true, validFrom: new Date(0), validTo: null, ...p,
  });
  const target = { productId: "p1", categoryId: "cakes", vendorId: "v1" };

  it("most specific wins", () => {
    const rules = [mk({ id: "g" }), mk({ id: "c", scope: "CATEGORY", categoryId: "cakes" }), mk({ id: "vc", scope: "VENDOR_CATEGORY", vendorId: "v1", categoryId: "cakes" })];
    expect(resolveRule(rules, target).id).toBe("vc");
  });
  it("ignores expired and inactive rules", () => {
    const rules = [mk({ id: "g" }), mk({ id: "p", scope: "PRODUCT", productId: "p1", validTo: new Date(1) }), mk({ id: "c", scope: "CATEGORY", categoryId: "cakes", isActive: false })];
    expect(resolveRule(rules, target).id).toBe("g");
  });
  it("throws without a global rule", () => {
    expect(() => resolveRule([], target)).toThrow(/GLOBAL/);
  });
});
