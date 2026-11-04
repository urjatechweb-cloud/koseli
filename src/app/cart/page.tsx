"use client";

import Link from "next/link";
import { useCart } from "@/components/cart";
import { ProductArt } from "@/components/art";
import { rs } from "@/lib/money";

export default function CartPage() {
  const { lines, ready, subtotalMinor, setQty, remove } = useCart();

  return (
    <main className="wrap grid gap-8 py-10">
      <h1 className="font-display text-4xl">Your cart</h1>
      {!ready ? null : lines.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-xl border border-dashed border-line p-8">
          <p className="font-semibold">Your cart is empty.</p>
          <Link href="/shop" className="btn-primary">Find a gift</Link>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <ul className="grid gap-4">
            {lines.map((l) => (
              <li key={l.productId} className="grid grid-cols-[80px_1fr] gap-4 rounded-xl border border-line bg-surface p-3 sm:grid-cols-[96px_1fr_auto] sm:items-center">
                <div className="overflow-hidden rounded-lg"><ProductArt category={l.category} slug={l.slug} title={l.title} /></div>
                <div className="grid min-w-0 gap-1">
                  <Link href={`/p/${l.slug}`} className="font-semibold hover:text-gurans">{l.title}</Link>
                  <span className="font-mono text-sm tabular-nums text-muted">{rs(l.unitMinor)} each</span>
                  <button type="button" onClick={() => remove(l.productId)} className="justify-self-start text-xs font-semibold text-gurans underline underline-offset-4">Remove</button>
                </div>
                <div className="col-span-2 flex items-center justify-between gap-4 sm:col-span-1 sm:justify-end">
                  <div className="flex items-center rounded-lg border border-line" role="group" aria-label={`Quantity of ${l.title}`}>
                    <button type="button" className="px-3 py-1.5" onClick={() => setQty(l.productId, l.quantity - 1)} aria-label="One fewer">−</button>
                    <span className="w-7 text-center font-mono tabular-nums">{l.quantity}</span>
                    <button type="button" className="px-3 py-1.5" onClick={() => setQty(l.productId, l.quantity + 1)} aria-label="One more">+</button>
                  </div>
                  <span className="w-28 text-right font-mono tabular-nums">{rs(l.unitMinor * l.quantity)}</span>
                </div>
              </li>
            ))}
          </ul>
          <aside className="grid content-start gap-4 rounded-xl border border-line bg-surface p-5">
            <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="font-mono tabular-nums">{rs(subtotalMinor)}</span></div>
            <p className="text-xs text-muted">Delivery fee is added at checkout. Paying from abroad? You'll see the price in your currency before you pay.</p>
            <Link href="/checkout" className="btn-primary">Checkout</Link>
          </aside>
        </div>
      )}
    </main>
  );
}
