import { describe, expect, it, vi } from "vitest";
import { foreignMinorToNpr, formatRate, nprToForeignMinor, parseRate, perUnit } from "@/server/fx/fx";
import { manualProvider, nrbProvider } from "@/server/fx/rate-providers";

describe("rate parsing", () => {
  it("parses decimal strings exactly", () => {
    expect(parseRate("133.215")).toBe(13_321_500_000n);
    expect(formatRate(parseRate("0.9"))).toBe("0.90000000");
    expect(() => parseRate("1e3")).toThrow();
    expect(() => parseRate("-1")).toThrow();
    expect(() => parseRate("0")).toThrow();
  });
  it("normalizes per-100 quotes (INR/JPY style)", () => {
    expect(formatRate(perUnit(parseRate("160.00"), 100))).toBe("1.60000000");
  });
});

describe("NPR -> foreign", () => {
  const usd = parseRate("133.50");
  it("converts with no buffer, rounding up", () => {
    // Rs 1740 / 133.50 = 13.0337... USD -> 1304 cents
    expect(nprToForeignMinor(174_000, "USD", usd, 0)).toBe(1304);
  });
  it("applies a 3% buffer", () => {
    // 13.0337 * 1.03 = 13.4247 -> 1343 cents
    expect(nprToForeignMinor(174_000, "USD", usd, 300)).toBe(1343);
  });
  it("handles zero-decimal currencies (JPY)", () => {
    // NRB-style: 10 JPY = 8.90 NPR -> 0.89 NPR per yen; Rs 1740 / 0.89 = 1955.05 -> 1956 yen
    const jpy = perUnit(parseRate("8.90"), 10);
    expect(nprToForeignMinor(174_000, "JPY", jpy, 0)).toBe(1956);
  });
  it("charge always covers the NPR total", () => {
    for (const npr of [100, 99_999, 174_000, 12_345_678]) {
      const f = nprToForeignMinor(npr, "GBP", parseRate("169.37"), 0);
      expect(foreignMinorToNpr(f, "GBP", parseRate("169.37"))).toBeGreaterThanOrEqual(npr);
    }
  });
  it("rejects bad inputs", () => {
    expect(() => nprToForeignMinor(0, "USD", usd, 0)).toThrow();
    expect(() => nprToForeignMinor(1.5, "USD", usd, 0)).toThrow();
    expect(() => nprToForeignMinor(100, "USD", usd, 5000)).toThrow();
  });
});

describe("providers", () => {
  it("parses an NRB-shaped payload, picks latest day, uses BUY and unit", async () => {
    const body = {
      data: {
        payload: [
          { published_on: "2026-11-03 00:00:00", rates: [{ currency: { iso3: "USD", unit: 1 }, buy: "133.00", sell: "133.60" }] },
          { published_on: "2026-11-04 00:00:00", rates: [
            { currency: { iso3: "USD", unit: 1 }, buy: "133.50", sell: "134.10" },
            { currency: { iso3: "JPY", unit: 10 }, buy: "8.90", sell: "8.95" },
            { currency: { iso3: "CNY", unit: 1 }, buy: "18.7", sell: "18.8" },
          ] },
        ],
      },
    };
    const f = vi.fn().mockResolvedValue(Response.json(body));
    const rates = await nrbProvider(f).fetchRates(["USD", "JPY"]);
    expect(rates.map((r) => [r.currency, formatRate(r.rateScaled)])).toEqual([["USD", "133.50000000"], ["JPY", "0.89000000"]]);
  });
  it("fails loudly on an unexpected NRB shape", async () => {
    const f = vi.fn().mockResolvedValue(Response.json({ data: { payload: [] } }));
    await expect(nrbProvider(f).fetchRates(["USD"])).rejects.toThrow();
  });
  it("manual override", async () => {
    const r = await manualProvider({ FX_MANUAL_RATES: '{"USD":"133.2"}' }).fetchRates(["USD", "GBP"]);
    expect(r).toHaveLength(1);
    expect(formatRate(r[0]!.rateScaled)).toBe("133.20000000");
  });
});
