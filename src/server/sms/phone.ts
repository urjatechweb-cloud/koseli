/**
 * Phone numbers for sign-in, normalized to E.164 (+9779812345678).
 *
 * Sign-in is limited to countries where Koseli's buyers actually live: Nepal and
 * the main Nepali diaspora destinations. This is the main defence against SMS
 * pumping (toll fraud), where bots request codes to premium-rate numbers in
 * other countries and the site pays for every message.
 */

/** Calling code -> country, longest codes first so "+977" wins over "+9". */
export const ALLOWED_COUNTRIES: { code: string; iso: string; name: string; nsn: RegExp }[] = [
  { code: "977", iso: "NP", name: "Nepal", nsn: /^9[78]\d{8}$/ },
  { code: "971", iso: "AE", name: "UAE", nsn: /^5\d{8}$/ },
  { code: "974", iso: "QA", name: "Qatar", nsn: /^[3567]\d{7}$/ },
  { code: "966", iso: "SA", name: "Saudi Arabia", nsn: /^5\d{8}$/ },
  { code: "965", iso: "KW", name: "Kuwait", nsn: /^[569]\d{7}$/ },
  { code: "968", iso: "OM", name: "Oman", nsn: /^[79]\d{7}$/ },
  { code: "973", iso: "BH", name: "Bahrain", nsn: /^[36]\d{7}$/ },
  { code: "60", iso: "MY", name: "Malaysia", nsn: /^1\d{8,9}$/ },
  { code: "91", iso: "IN", name: "India", nsn: /^[6-9]\d{9}$/ },
  { code: "81", iso: "JP", name: "Japan", nsn: /^[789]0\d{8}$/ },
  { code: "82", iso: "KR", name: "South Korea", nsn: /^10\d{8}$/ },
  { code: "61", iso: "AU", name: "Australia", nsn: /^4\d{8}$/ },
  { code: "44", iso: "GB", name: "United Kingdom", nsn: /^7\d{9}$/ },
  { code: "1", iso: "US", name: "USA / Canada", nsn: /^[2-9]\d{2}[2-9]\d{6}$/ },
].sort((a, b) => b.code.length - a.code.length);

export type PhoneResult = { ok: true; e164: string; country: string } | { ok: false; reason: string };

/**
 * Accepts "+44 7700 900123", "0044…", or a bare Nepali mobile "98XXXXXXXX".
 * Only mobile-number shapes are accepted, since a landline can't receive the code.
 */
export function normalizePhone(input: string): PhoneResult {
  let s = input.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (/^9[78]\d{8}$/.test(s)) s = `+977${s}`; // bare Nepali mobile
  if (!/^\+[1-9]\d{6,14}$/.test(s)) return { ok: false, reason: "Enter your mobile number with its country code, e.g. +977 98XXXXXXXX" };

  const digits = s.slice(1);
  const c = ALLOWED_COUNTRIES.find((x) => digits.startsWith(x.code));
  if (!c) return { ok: false, reason: "Sign-in by SMS isn't available for that country yet" };
  let nsn = digits.slice(c.code.length);
  if (c.code === "44" || c.code === "61" || c.code === "81") nsn = nsn.replace(/^0/, ""); // "+44 07700…" typed with trunk 0
  if (!c.nsn.test(nsn)) return { ok: false, reason: `That doesn't look like a ${c.name} mobile number` };
  return { ok: true, e164: `+${c.code}${nsn}`, country: c.iso };
}

/** "+9779812345678" -> "+977 98•••••678" for showing on screen. */
export function maskPhone(e164: string): string {
  const c = ALLOWED_COUNTRIES.find((x) => e164.slice(1).startsWith(x.code));
  const rest = c ? e164.slice(1 + c.code.length) : e164.slice(1);
  return `+${c?.code ?? ""} ${rest.slice(0, 2)}${"•".repeat(Math.max(0, rest.length - 5))}${rest.slice(-3)}`;
}
