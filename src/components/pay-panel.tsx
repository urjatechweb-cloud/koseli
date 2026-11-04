"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js/pure"; // pure: Stripe.js loads only when a buyer opens card payment
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { rs } from "@/lib/money";

type Tab = "fonepay" | "card" | "demo";
const CURRENCIES = ["USD", "GBP", "AUD", "EUR", "CAD", "AED", "QAR", "JPY", "KRW"] as const;
const ZERO_DECIMAL = new Set(["JPY", "KRW"]);

const fmt = (minor: number, cur: string) => {
  const d = ZERO_DECIMAL.has(cur) ? 0 : 2;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(minor / 10 ** d);
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

export function PayPanel({ orderId, totalMinor, demoEnabled, stripeKey }: { orderId: string; totalMinor: number; demoEnabled: boolean; stripeKey: string | null }) {
  const [tab, setTab] = useState<Tab>("fonepay");
  const tabs: [Tab, string][] = [["fonepay", "In Nepal"], ["card", "From abroad"], ...(demoEnabled ? [["demo", "Demo"] as [Tab, string]] : [])];

  return (
    <aside className="grid content-start gap-4 rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-24">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl">Pay</h2>
        <span className="font-mono text-lg tabular-nums">{rs(totalMinor)}</span>
      </div>
      <div className="grid rounded-lg border border-line p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }} role="tablist" aria-label="Payment method">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-md px-2 py-2 text-sm font-semibold ${tab === k ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "fonepay" && <FonepayQr orderId={orderId} />}
      {tab === "card" && <CardAbroad orderId={orderId} stripeKey={stripeKey} />}
      {tab === "demo" && <DemoPay orderId={orderId} />}
    </aside>
  );
}

function FonepayQr({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [qr, setQr] = useState<{ prn: string; qrDataUrl: string } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "waiting" | "expired" | "error">("idle");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => () => clearInterval(timer.current), []);

  async function start() {
    setState("loading");
    setError("");
    try {
      const data = await post<{ prn: string; qrDataUrl: string }>("/api/payments/fonepay/qr", { orderId });
      setQr(data);
      setState("waiting");
      clearInterval(timer.current);
      timer.current = setInterval(async () => {
        const r = await fetch(`/api/payments/fonepay/status?prn=${data.prn}`).then((x) => x.json()).catch(() => null);
        if (r?.status === "SUCCEEDED") { clearInterval(timer.current); router.refresh(); }
        else if (r?.status === "FAILED" || r?.status === "EXPIRED") { clearInterval(timer.current); setState("expired"); }
      }, 3000);
    } catch (e) {
      setState("error");
      setError((e as Error).message === "payment service unavailable" ? "Fonepay isn't connected yet on this site. Use another method." : (e as Error).message);
    }
  }

  return (
    <div className="grid gap-3 text-sm">
      <p className="text-muted">Scan with any Nepali bank or wallet app that supports Fonepay QR.</p>
      {state === "waiting" && qr ? (
        <div className="grid justify-items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.qrDataUrl} alt="Fonepay QR code for this order" width={240} height={240} className="rounded-lg bg-white p-2" />
          <p role="status">Waiting for your payment… the page updates on its own.</p>
        </div>
      ) : (
        <button type="button" className="btn-primary" onClick={start} disabled={state === "loading"}>
          {state === "loading" ? "Creating QR…" : state === "expired" ? "QR expired · make a new one" : "Show QR code"}
        </button>
      )}
      {state === "error" && <p role="alert" className="rounded-lg bg-gurans-soft p-3">{error}</p>}
    </div>
  );
}

function CardAbroad({ orderId, stripeKey }: { orderId: string; stripeKey: string | null }) {
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("USD");
  const [quote, setQuote] = useState<{ id: string; foreignMinor: number; currency: string; expiresAt: string } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);

  async function getQuote() {
    setBusy(true); setError(""); setSecret(null);
    try { setQuote(await post("/api/fx/quote", { orderId, currency })); }
    catch (e) { setError((e as Error).message === "payment service unavailable" ? "Exchange rates are unavailable right now. Try again shortly." : (e as Error).message); }
    finally { setBusy(false); }
  }

  async function startCard() {
    if (!quote) return;
    setBusy(true); setError("");
    try { setSecret((await post<{ clientSecret: string }>("/api/payments/stripe/intent", { quoteId: quote.id })).clientSecret); }
    catch (e) { setError((e as Error).message === "payment service unavailable" ? "Card payments aren't connected yet on this site." : (e as Error).message); }
    finally { setBusy(false); }
  }

  if (!stripeKey) {
    return <p className="rounded-lg bg-marigold-soft p-3 text-sm">Card payments from abroad aren't switched on for this site yet.</p>;
  }

  return (
    <div className="grid gap-3 text-sm">
      <label className="label" htmlFor="pay-currency">Pay in
        <select id="pay-currency" className="field" value={currency} onChange={(e) => { setCurrency(e.target.value as typeof currency); setQuote(null); setSecret(null); }}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      {!quote ? (
        <button type="button" className="btn-primary" onClick={getQuote} disabled={busy}>{busy ? "Getting price…" : `See price in ${currency}`}</button>
      ) : (
        <div className="grid gap-3">
          <div className="rounded-lg bg-leaf-soft p-3">
            <p className="font-mono text-xl tabular-nums">{fmt(quote.foreignMinor, quote.currency)}</p>
            <p className="text-xs text-muted">Price held until {new Date(quote.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Includes card and exchange fees.</p>
          </div>
          {!secret ? (
            <button type="button" className="btn-primary" onClick={startCard} disabled={busy}>{busy ? "Starting…" : "Pay by card or Apple Pay"}</button>
          ) : (
            stripePromise && (
              <Elements stripe={stripePromise} options={{ clientSecret: secret, appearance: { theme: "stripe" } }}>
                <StripeForm orderId={orderId} />
              </Elements>
            )
          )}
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-gurans-soft p-3">{error}</p>}
    </div>
  );
}

function StripeForm({ orderId }: { orderId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true); setError("");
    const { error: err } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/orders/${orderId}?payment=processing` },
    });
    if (err) { setError(err.message ?? "Payment failed"); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <PaymentElement />
      <button type="submit" className="btn-primary" disabled={!stripe || busy}>{busy ? "Paying…" : "Pay now"}</button>
      {error && <p role="alert" className="rounded-lg bg-gurans-soft p-3">{error}</p>}
    </form>
  );
}

function DemoPay({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="grid gap-3 text-sm">
      <p className="rounded-lg bg-marigold-soft p-3">Demo mode: marks the order paid without charging anyone. For team previews only.</p>
      <button type="button" className="btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { await post("/api/payments/demo", { orderId }); router.refresh(); }
        catch (e) { setError((e as Error).message); setBusy(false); }
      }}>
        {busy ? "Paying…" : "Complete demo payment"}
      </button>
      {error && <p role="alert" className="rounded-lg bg-gurans-soft p-3">{error}</p>}
    </div>
  );
}
