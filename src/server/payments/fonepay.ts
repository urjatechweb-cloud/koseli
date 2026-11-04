import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Fonepay gateway client — Web redirect checkout + Dynamic QR.
 *
 * ⚠️  FIELD ORDER / ENDPOINT CONFIRMATION
 * Fonepay signs every request/response with HMAC-SHA512 over a comma-joined
 * list of fields (the "DV" / dataValidation value). The field orders and URLs
 * below follow Fonepay's published merchant integration pattern, but Fonepay
 * issues the authoritative spec privately on merchant onboarding. Before going
 * live, diff every `*_DV_FIELDS` constant and every URL against the PDF Fonepay
 * sends you, and run the end-to-end flow on their dev environment. All of it
 * is isolated in this file so that check is a single-file review.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface FonepayConfig {
  merchantCode: string;
  secretKey: string;
  qrUsername: string;
  qrPassword: string;
  webBaseUrl: string; // hosts /api/merchantRequest and /api/merchantRequest/verificationMerchant
  qrBaseUrl: string; // hosts /api/merchant/merchantDetailsForThirdParty/*
}

const DEFAULT_HOSTS = {
  dev: {
    web: "https://dev-clientapi.fonepay.com",
    qr: "https://dev-merchantapi.fonepay.com",
  },
  live: {
    web: "https://clientapi.fonepay.com",
    qr: "https://merchantapi.fonepay.com",
  },
} as const;

export function loadFonepayConfig(env: NodeJS.ProcessEnv = process.env): FonepayConfig {
  const mode = env.FONEPAY_ENV === "live" ? "live" : "dev";
  const need = (k: string): string => {
    const v = env[k];
    if (!v) throw new Error(`Missing env ${k}`);
    return v;
  };
  return {
    merchantCode: need("FONEPAY_MERCHANT_CODE"),
    secretKey: need("FONEPAY_SECRET_KEY"),
    qrUsername: env.FONEPAY_QR_USERNAME ?? "",
    qrPassword: env.FONEPAY_QR_PASSWORD ?? "",
    webBaseUrl: env.FONEPAY_WEB_BASE_URL || DEFAULT_HOSTS[mode].web,
    qrBaseUrl: env.FONEPAY_QR_BASE_URL || DEFAULT_HOSTS[mode].qr,
  };
}

// ---------------------------------------------------------------------------
// Signing primitives
// ---------------------------------------------------------------------------

export function hmacSha512Hex(secret: string, message: string): string {
  return createHmac("sha512", secret).update(message, "utf8").digest("hex").toUpperCase();
}

/** Build DV from an ordered field list. Missing fields sign as empty strings. */
export function signFields(secret: string, fields: readonly string[], values: Record<string, string | undefined>): string {
  return hmacSha512Hex(secret, fields.map((f) => values[f] ?? "").join(","));
}

/** Constant-time, case-insensitive hex compare. */
export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a.toUpperCase(), "utf8");
  const y = Buffer.from(b.toUpperCase(), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Paisa -> "1250.00". Fonepay amounts are rupees with up to 2 decimals. */
export function minorToAmount(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new RangeError(`invalid amount ${minor}`);
  return `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

/** "1250.5" | "1250.50" | "1250" -> 125050 paisa. Rejects anything else. */
export function amountToMinor(amount: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!m) throw new RangeError(`unparseable amount "${amount}"`);
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

/** Fonepay DT is MM/DD/YYYY in Nepal time. */
export function fonepayDate(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")}/${get("year")}`;
}

// ---------------------------------------------------------------------------
// 1) Web redirect checkout
// ---------------------------------------------------------------------------

const WEB_REQUEST_DV_FIELDS = ["PID", "MD", "PRN", "AMT", "CRN", "DT", "R1", "R2", "RU"] as const;
const WEB_RETURN_DV_FIELDS = ["PRN", "PID", "PS", "RC", "UID", "BC", "INI", "P_AMT", "R_AMT"] as const;
const WEB_VERIFY_DV_FIELDS = ["PID", "AMT", "PRN", "BID", "UID"] as const;

export interface WebPaymentRequest {
  prn: string; // our Payment.reference — unique per attempt
  amountMinor: number;
  remarks1: string; // shown to payer, e.g. order number
  remarks2?: string;
  returnUrl: string; // absolute URL of /api/payments/fonepay/return
}

export function buildWebPaymentUrl(cfg: FonepayConfig, req: WebPaymentRequest, now = new Date()): string {
  const values: Record<string, string> = {
    PID: cfg.merchantCode,
    MD: "P", // payment
    PRN: req.prn,
    AMT: minorToAmount(req.amountMinor),
    CRN: "NPR",
    DT: fonepayDate(now),
    R1: sanitizeRemark(req.remarks1),
    R2: sanitizeRemark(req.remarks2 ?? "N/A"),
    RU: req.returnUrl,
  };
  const url = new URL("/api/merchantRequest", cfg.webBaseUrl);
  for (const f of WEB_REQUEST_DV_FIELDS) url.searchParams.set(f, values[f]!);
  url.searchParams.set("DV", signFields(cfg.secretKey, WEB_REQUEST_DV_FIELDS, values));
  return url.toString();
}

/** Remarks are part of the signed CSV payload — strip commas and control chars. */
function sanitizeRemark(s: string): string {
  return s.replace(/[,\r\n\t]/g, " ").slice(0, 50).trim() || "N/A";
}

/**
 * `trusted: false` means the request could not be proven to come from Fonepay
 * (forged / tampered). Callers must NOT change payment state on an untrusted
 * failure, or anyone could cancel other people's pending payments by hitting
 * the public return URL with a guessed PRN.
 */
export type WebReturnResult =
  | { ok: true; prn: string; uid: string; paidMinor: number }
  | { ok: false; trusted: boolean; prn: string | null; reason: string };

/**
 * Handle the browser redirect back from Fonepay.
 * Step 1: verify the DV on the query string (proves Fonepay sent it).
 * Step 2: server-to-server verification call (proves the money actually moved).
 * The caller MUST additionally check `paidMinor` equals the Payment it stored.
 */
export async function verifyWebReturn(
  cfg: FonepayConfig,
  query: URLSearchParams,
  expectedAmountMinor: number,
  fetchImpl: typeof fetch = fetch,
): Promise<WebReturnResult> {
  const v = Object.fromEntries(query.entries()) as Record<string, string>;
  const prn = v.PRN ?? null;
  if (!prn || !v.DV) return { ok: false, trusted: false, prn, reason: "missing PRN/DV" };
  if (v.PID !== cfg.merchantCode) return { ok: false, trusted: false, prn, reason: "merchant mismatch" };

  const expectedDv = signFields(cfg.secretKey, WEB_RETURN_DV_FIELDS, v);
  if (!safeEqualHex(expectedDv, v.DV)) return { ok: false, trusted: false, prn, reason: "bad signature" };
  if (v.PS !== "true" || (v.RC ?? "").toLowerCase() !== "successful") {
    return { ok: false, trusted: true, prn, reason: `declined (PS=${v.PS}, RC=${v.RC})` };
  }

  const uid = v.UID ?? "";
  const bid = v.BID ?? "";
  const amt = minorToAmount(expectedAmountMinor);
  const verifyValues = { PID: cfg.merchantCode, AMT: amt, PRN: prn, BID: bid, UID: uid };
  const url = new URL("/api/merchantRequest/verificationMerchant", cfg.webBaseUrl);
  for (const f of WEB_VERIFY_DV_FIELDS) url.searchParams.set(f, verifyValues[f]);
  url.searchParams.set("DV", signFields(cfg.secretKey, WEB_VERIFY_DV_FIELDS, verifyValues));

  const res = await fetchImpl(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const body = await res.text();
  // Verification returns XML: <response><success>true</success>…<response_code>successful</response_code>…
  const success = /<success>\s*true\s*<\/success>/i.test(body);
  const code = /<response_code>\s*([^<]+?)\s*<\/response_code>/i.exec(body)?.[1]?.toLowerCase();
  if (!res.ok || !success || code !== "successful") {
    // Signature was valid but Fonepay won't confirm settlement. Leave the
    // payment PENDING (trusted:false) — a reconciliation job re-checks later.
    return { ok: false, trusted: false, prn, reason: `verification failed (${res.status}, ${code ?? "no code"})` };
  }

  const paidMinor = v.P_AMT ? amountToMinor(v.P_AMT) : expectedAmountMinor;
  return { ok: true, prn, uid, paidMinor };
}

// ---------------------------------------------------------------------------
// 2) Dynamic QR (scan-to-pay with any Fonepay-network bank / wallet app)
// ---------------------------------------------------------------------------

const QR_CREATE_DV_FIELDS = ["amount", "prn", "merchantCode", "remarks1", "remarks2"] as const;
const QR_STATUS_DV_FIELDS = ["prn", "merchantCode"] as const;

export interface DynamicQrResult {
  qrMessage: string; // EMV payload — render with `qrcode`
  websocketUrl: string | null; // live status push from Fonepay, if provided
  raw: unknown;
}

export async function createDynamicQr(
  cfg: FonepayConfig,
  req: { prn: string; amountMinor: number; remarks1: string; remarks2?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<DynamicQrResult> {
  const values = {
    amount: minorToAmount(req.amountMinor),
    prn: req.prn,
    merchantCode: cfg.merchantCode,
    remarks1: sanitizeRemark(req.remarks1),
    remarks2: sanitizeRemark(req.remarks2 ?? "N/A"),
  };
  const body = {
    ...values,
    dataValidation: signFields(cfg.secretKey, QR_CREATE_DV_FIELDS, values),
    username: cfg.qrUsername,
    password: cfg.qrPassword,
  };
  const res = await fetchImpl(
    new URL("/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload", cfg.qrBaseUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || typeof json.qrMessage !== "string" || !json.qrMessage) {
    throw new FonepayError(`QR create failed (${res.status}): ${String(json?.message ?? "no body")}`);
  }
  return {
    qrMessage: json.qrMessage,
    websocketUrl: typeof json.thirdpartyQrWebSocketUrl === "string" ? json.thirdpartyQrWebSocketUrl : null,
    raw: json,
  };
}

export type QrPaymentStatus = "success" | "failed" | "pending";

export async function getQrStatus(
  cfg: FonepayConfig,
  prn: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: QrPaymentStatus; raw: unknown }> {
  const values = { prn, merchantCode: cfg.merchantCode };
  const res = await fetchImpl(
    new URL("/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus", cfg.qrBaseUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        ...values,
        dataValidation: signFields(cfg.secretKey, QR_STATUS_DV_FIELDS, values),
        username: cfg.qrUsername,
        password: cfg.qrPassword,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) throw new FonepayError(`QR status failed (${res.status})`);
  const s = String(json.paymentStatus ?? "").toLowerCase();
  const status: QrPaymentStatus = s === "success" ? "success" : s === "failed" ? "failed" : "pending";
  return { status, raw: json };
}

export class FonepayError extends Error {
  override name = "FonepayError";
}
