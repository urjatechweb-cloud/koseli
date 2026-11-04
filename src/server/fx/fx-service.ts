import "server-only";
import type { Currency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatRate, nprToForeignMinor, parseRate, type CurrencyCode } from "./fx";
import { manualProvider, nrbProvider, type RateProvider } from "./rate-providers";

/** Currencies we let diaspora buyers pay in through card rails (Stripe/PayPal). */
export const INTERNATIONAL_CURRENCIES = ["USD", "AUD", "GBP", "EUR", "CAD", "JPY", "KRW", "AED", "QAR", "SAR"] as const satisfies readonly CurrencyCode[];
export type InternationalCurrency = (typeof INTERNATIONAL_CURRENCIES)[number];

const FRESH_MS = 26 * 3_600_000; // NRB publishes once a day
const STALE_LIMIT_MS = 72 * 3_600_000; // beyond this we refuse to quote
const QUOTE_TTL_MS = 15 * 60_000;

const bufferBps = () => {
  const n = Number(process.env.FX_BUFFER_BPS ?? 300);
  return Number.isInteger(n) && n >= 0 && n <= 2000 ? n : 300;
};

// Manual first so ops can override a bad feed instantly.
const providers = (): RateProvider[] => [manualProvider(), nrbProvider()];

async function latestStored(currency: Currency) {
  return prisma.exchangeRate.findFirst({
    where: { base: currency, quote: "NPR" },
    orderBy: { fetchedAt: "desc" },
  });
}

/** Refresh all international rates. Call from a cron (e.g. Vercel Cron, 11:00 NPT daily). */
export async function refreshRates(): Promise<{ source: string; count: number }> {
  for (const p of providers()) {
    try {
      const snaps = await p.fetchRates(INTERNATIONAL_CURRENCIES);
      if (snaps.length === 0) continue;
      await prisma.exchangeRate.createMany({
        data: snaps.map((s) => ({ base: s.currency, quote: "NPR", rate: formatRate(s.rateScaled), source: s.source })),
      });
      return { source: p.name, count: snaps.length };
    } catch (e) {
      console.error(`[fx] provider ${p.name} failed`, e);
    }
  }
  throw new Error("all FX providers failed");
}

export async function getRate(currency: InternationalCurrency): Promise<{ rateScaled: bigint; source: string; fetchedAt: Date }> {
  let row = await latestStored(currency);
  if (!row || Date.now() - row.fetchedAt.getTime() > FRESH_MS) {
    try {
      await refreshRates();
      row = await latestStored(currency);
    } catch (e) {
      console.warn("[fx] refresh failed, falling back to cached rate", e);
    }
  }
  if (!row) throw new Error(`no FX rate available for ${currency}`);
  if (Date.now() - row.fetchedAt.getTime() > STALE_LIMIT_MS) throw new Error(`FX rate for ${currency} is stale`);
  return { rateScaled: parseRate(row.rate.toFixed(8)), source: row.source, fetchedAt: row.fetchedAt };
}

/** Lock a foreign-currency price for an order the user owns. */
export async function quoteOrder(orderId: string, userId: string, currency: InternationalCurrency) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId, status: "PENDING_PAYMENT" },
    select: { id: true, totalMinor: true },
  });
  if (!order) return null;

  const { rateScaled, source, fetchedAt } = await getRate(currency);
  const buffer = bufferBps();
  return prisma.fxQuote.create({
    data: {
      orderId: order.id,
      currency,
      nprMinor: order.totalMinor,
      foreignMinor: nprToForeignMinor(order.totalMinor, currency, rateScaled, buffer),
      rate: formatRate(rateScaled),
      bufferBps: buffer,
      rateSource: source,
      rateFetchedAt: fetchedAt,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
    },
    select: { id: true, currency: true, nprMinor: true, foreignMinor: true, expiresAt: true },
  });
}
