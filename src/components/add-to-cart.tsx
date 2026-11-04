"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart, type CartLine } from "./cart";

export function AddToCart({ line }: { line: Omit<CartLine, "quantity"> }) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-lg border border-line" role="group" aria-label="Quantity">
          <button type="button" className="px-3 py-2.5 text-lg" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="One fewer">−</button>
          <span className="w-8 text-center font-mono tabular-nums" aria-live="polite">{qty}</span>
          <button type="button" className="px-3 py-2.5 text-lg" onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="One more">+</button>
        </div>
        <button
          type="button"
          className="btn-primary flex-1 sm:flex-none"
          onClick={() => {
            add(line, qty);
            setAdded(true);
          }}
        >
          Add to cart
        </button>
      </div>
      {added && (
        <p className="text-sm" role="status">
          Added. <Link href="/cart" className="font-semibold text-gurans underline underline-offset-4">Go to cart</Link>
        </p>
      )}
    </div>
  );
}
