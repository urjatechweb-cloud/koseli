"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/** Only same-site paths, so ?next= can't send people to another website after sign-in. */
function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/account";
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

function SignIn() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; masked: string; demoCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const c = await post<{ challengeId: string; masked: string; demoCode?: string }>("/api/auth/start", { phone });
      setChallenge(c);
      setCode("");
      setStep("code");
      setWait(30);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      await post("/api/auth/verify", { challengeId: challenge.challengeId, code });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="wrap grid max-w-md gap-6 py-12">
      <div className="grid gap-2">
        <h1 className="font-display text-4xl">Sign in</h1>
        <p className="text-muted">See your orders on any device and check out faster. We'll text you a 6-digit code. No password.</p>
      </div>

      {step === "phone" ? (
        <form onSubmit={sendCode} className="grid gap-4">
          <label className="label" htmlFor="phone">
            Mobile number
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98XXXXXXXX or +44 7700 900123"
              className="field font-mono"
            />
          </label>
          <p className="text-xs text-muted">
            Nepali numbers work without a country code. Abroad? Start with + and your country code. We support the Gulf, Malaysia, India,
            Japan, Korea, Australia, the UK and the US.
          </p>
          {error && <p role="alert" className="rounded-lg bg-gurans-soft p-3 text-sm">{error}</p>}
          <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Text me a code"}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="grid gap-4">
          <p className="text-sm">
            We sent a code to <span className="font-mono font-semibold">{challenge?.masked}</span>.{" "}
            <button type="button" className="font-semibold text-gurans underline underline-offset-4" onClick={() => { setStep("phone"); setError(""); }}>
              Change number
            </button>
          </p>
          {challenge?.demoCode && (
            <p className="rounded-lg bg-marigold-soft p-3 text-sm">
              Demo mode, no SMS sent. Your code is <span className="font-mono font-semibold">{challenge.demoCode}</span>.
            </p>
          )}
          <label className="label" htmlFor="code">
            6-digit code
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="field text-center font-mono text-2xl tracking-[0.5em]"
            />
          </label>
          {error && <p role="alert" className="rounded-lg bg-gurans-soft p-3 text-sm">{error}</p>}
          <button className="btn-primary" type="submit" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</button>
          <button type="button" className="btn-ghost" disabled={busy || wait > 0} onClick={() => sendCode()}>
            {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
          </button>
        </form>
      )}
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
