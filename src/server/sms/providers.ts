/**
 * SMS senders. Nepali numbers go through a Nepali gateway (Sparrow SMS) when
 * configured, which is typically cheaper and more reliable for NTC/Ncell;
 * everything else goes through Twilio.
 *
 * ⚠️ Both request shapes are written from each provider's public docs as
 * remembered, not checked against a live account. They are isolated here and
 * covered by request-shape tests; confirm with one real send per provider.
 */

export interface SmsSender {
  name: string;
  send(toE164: string, text: string): Promise<void>;
}

export class SmsError extends Error {
  override name = "SmsError";
}

export function twilioSender(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): SmsSender | null {
  const sid = env.TWILIO_ACCOUNT_SID, token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM;
  if (!sid || !token || !from) return null;
  return {
    name: "twilio",
    async send(to, text) {
      const body = new URLSearchParams({ To: to, Body: text });
      body.set(from.startsWith("MG") ? "MessagingServiceSid" : "From", from);
      const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new SmsError(`twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}

export function sparrowSender(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): SmsSender | null {
  const token = env.SPARROW_TOKEN, from = env.SPARROW_FROM;
  if (!token || !from) return null;
  return {
    name: "sparrow",
    async send(to, text) {
      // Sparrow expects the 10-digit local number, without +977.
      const local = to.replace(/^\+977/, "");
      const res = await fetchImpl("https://api.sparrowsms.com/v2/sms/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, from, to: local, text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new SmsError(`sparrow ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}

/** Logs instead of sending. For local development only. */
export const logSender: SmsSender = {
  name: "log",
  async send(to, text) {
    console.info(`[sms:log] to ${to}: ${text}`);
  },
};

/** Picks the sender for a number, or null when nothing is configured for it. */
export function senderFor(
  toE164: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): SmsSender | null {
  if (env.SMS_PROVIDER === "log") return env.NODE_ENV === "production" ? null : logSender;
  const sparrow = sparrowSender(env, fetchImpl);
  const twilio = twilioSender(env, fetchImpl);
  if (toE164.startsWith("+977") && sparrow) return sparrow;
  return twilio;
}
