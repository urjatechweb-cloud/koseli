"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useCart } from "@/components/cart";
import { rs } from "@/lib/money";

function nepalToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default function CheckoutPage() {
  const { lines, ready, subtotalMinor, clear } = useCart();
  const router = useRouter();
  const today = useMemo(nepalToday, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const ward = s("ward");
    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          city: "pokhara",
          deliverOn: s("deliverOn"),
          senderName: s("senderName"),
          senderContact: s("senderContact"),
          recipientName: s("recipientName"),
          recipientPhone: s("recipientPhone").replace(/[\s-]/g, ""),
          line1: s("line1"),
          landmark: s("landmark"),
          ward: ward ? Number(ward) : undefined,
          giftMessage: s("giftMessage"),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { orderId?: string; error?: string };
      if (!res.ok || !data.orderId) throw new Error(data.error ?? "Couldn't place the order. Try again.");
      clear();
      router.push(`/orders/${data.orderId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (ready && lines.length === 0) {
    return (
      <main className="wrap grid justify-items-start gap-3 py-10">
        <h1 className="font-display text-4xl">Checkout</h1>
        <p>Your cart is empty.</p>
        <Link href="/shop" className="btn-primary">Find a gift</Link>
      </main>
    );
  }

  return (
    <main className="wrap grid gap-8 py-10">
      <h1 className="font-display text-4xl">Checkout</h1>
      <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-8">
          <fieldset className="grid gap-4">
            <legend className="mb-3 font-display text-2xl">Who is it for?</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="label" htmlFor="recipientName">Recipient's name
                <input id="recipientName" name="recipientName" required maxLength={80} className="field" autoComplete="off" />
              </label>
              <label className="label" htmlFor="recipientPhone">Recipient's mobile (Nepal)
                <input id="recipientPhone" name="recipientPhone" required inputMode="tel" placeholder="98XXXXXXXX" className="field" />
              </label>
            </div>
          </fieldset>

          <fieldset className="grid gap-4">
            <legend className="mb-3 font-display text-2xl">Where in Pokhara?</legend>
            <label className="label" htmlFor="line1">Street, tole or area
              <input id="line1" name="line1" required minLength={3} maxLength={160} placeholder="Lakeside, Baidam" className="field" />
            </label>
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <label className="label" htmlFor="landmark">Nearest landmark
                <input id="landmark" name="landmark" maxLength={160} placeholder="Opposite Hotel Barahi, blue gate" className="field" />
              </label>
              <label className="label" htmlFor="ward">Ward no.
                <input id="ward" name="ward" type="number" min={1} max={40} className="field" />
              </label>
            </div>
            <label className="label sm:max-w-[240px]" htmlFor="deliverOn">Delivery date
              <input id="deliverOn" name="deliverOn" type="date" required min={today} defaultValue={today} className="field" />
            </label>
          </fieldset>

          <fieldset className="grid gap-4">
            <legend className="mb-3 font-display text-2xl">From you</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="label" htmlFor="senderName">Your name
                <input id="senderName" name="senderName" required maxLength={80} autoComplete="name" className="field" />
              </label>
              <label className="label" htmlFor="senderContact">Your email or phone
                <input id="senderContact" name="senderContact" required minLength={5} maxLength={120} autoComplete="email" className="field" />
              </label>
            </div>
            <label className="label" htmlFor="giftMessage"><span>Message on the card <span className="font-normal text-muted">(optional)</span></span>
              <textarea id="giftMessage" name="giftMessage" maxLength={300} rows={3} placeholder="Happy Tihar, Didi! Miss you." className="field" />
            </label>
          </fieldset>
        </div>

        <aside className="grid content-start gap-4 rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-24">
          <h2 className="font-semibold">Order summary</h2>
          <ul className="grid gap-2 text-sm">
            {lines.map((l) => (
              <li key={l.productId} className="flex justify-between gap-3">
                <span className="min-w-0">{l.quantity} × {l.title}</span>
                <span className="shrink-0 whitespace-nowrap font-mono tabular-nums">{rs(l.unitMinor * l.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-line pt-3"><span className="text-muted">Subtotal</span><span className="font-mono tabular-nums">{rs(subtotalMinor)}</span></div>
          <p className="text-xs text-muted">Delivery fee and final total are confirmed on the next step, where you choose how to pay.</p>
          {error && <p role="alert" className="rounded-lg bg-gurans-soft p-3 text-sm">{error}</p>}
          <button type="submit" className="btn-primary" disabled={busy || !ready}>{busy ? "Placing order…" : "Continue to payment"}</button>
        </aside>
      </form>
    </main>
  );
}
