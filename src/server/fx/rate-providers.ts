import { z } from "zod";
import { parseRate, perUnit, type CurrencyCode } from "./fx";

export interface RateSnapshot {
  currency: CurrencyCode;
  rateScaled: bigint; // NPR per 1 unit, ×10^8
  source: string;
  publishedAt: Date;
}

export interface RateProvider {
  name: string;
  fetchRates(currencies: readonly CurrencyCode[]): Promise<RateSnapshot[]>;
}

/**
 * Nepal Rastra Bank official forex feed.
 *
 * ⚠️ Response shape written to NRB's public API as commonly documented and
 * NOT yet checked against a live response (the build sandbox couldn't reach
 * nrb.org.np). The zod schema rejects anything unexpected, so a shape change
 * fails loudly and falls through to the next provider rather than mispricing.
 *
 * We use the BUY rate: the NPR a bank pays for 1 unit of foreign currency,
 * which is what we actually realize when diaspora money is remitted in.
 */
const NrbResponse = z.object({
  data: z.object({
    payload: z
      .array(
        z.object({
          published_on: z.string(),
          rates: z.array(
            z.object({
              currency: z.object({ iso3: z.string(), unit: z.coerce.number().int().positive() }),
              buy: z.coerce.string(),
            }),
          ),
        }),
      )
      .min(1),
  }),
});

export function nrbProvider(fetchImpl: typeof fetch = fetch, now = () => new Date()): RateProvider {
  return {
    name: "nrb",
    async fetchRates(currencies) {
      const today = now();
      const from = new Date(today.getTime() - 5 * 86_400_000); // span weekends/holidays
      const ymd = (d: Date) => d.toISOString().slice(0, 10);
      const url = `https://www.nrb.org.np/api/forex/v1/rates?page=1&per_page=10&from=${ymd(from)}&to=${ymd(today)}`;
      const res = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`NRB ${res.status}`);
      const parsed = NrbResponse.parse(await res.json());
      const latest = [...parsed.data.payload].sort((a, b) => b.published_on.localeCompare(a.published_on))[0]!;
      const publishedAt = new Date(latest.published_on);
      const want = new Set<string>(currencies);
      return latest.rates
        .filter((r) => want.has(r.currency.iso3))
        .map((r) => ({
          currency: r.currency.iso3 as CurrencyCode,
          rateScaled: perUnit(parseRate(r.buy), r.currency.unit),
          source: "nrb",
          publishedAt,
        }));
    },
  };
}

/**
 * Ops override / fallback: FX_MANUAL_RATES='{"USD":"133.20","GBP":"169.10"}'
 * (NPR per 1 unit). Lets finance pin rates during a feed outage.
 */
export function manualProvider(env: Record<string, string | undefined> = process.env): RateProvider {
  return {
    name: "manual",
    async fetchRates(currencies) {
      if (!env.FX_MANUAL_RATES) return [];
      const map = z.record(z.string()).parse(JSON.parse(env.FX_MANUAL_RATES));
      return currencies
        .filter((c) => map[c])
        .map((c) => ({ currency: c, rateScaled: parseRate(map[c]!), source: "manual", publishedAt: new Date() }));
    },
  };
}
