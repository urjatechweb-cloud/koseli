"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface CartLine {
  productId: string;
  slug: string;
  title: string;
  category: string;
  unitMinor: number; // display only; the server reprices at checkout
  quantity: number;
}

interface CartApi {
  lines: CartLine[];
  count: number;
  subtotalMinor: number;
  ready: boolean;
  add: (line: Omit<CartLine, "quantity">, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const KEY = "koseli.cart.v1";
const Ctx = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLines(JSON.parse(raw) as CartLine[]);
    } catch {
      /* storage blocked: start empty */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines, ready]);

  const add = useCallback<CartApi["add"]>((line, qty = 1) => {
    setLines((ls) => {
      const found = ls.find((l) => l.productId === line.productId);
      if (found) return ls.map((l) => (l === found ? { ...l, ...line, quantity: Math.min(20, l.quantity + qty) } : l));
      return [...ls, { ...line, quantity: Math.min(20, qty) }];
    });
  }, []);
  const setQty = useCallback((id: string, q: number) => {
    setLines((ls) => (q <= 0 ? ls.filter((l) => l.productId !== id) : ls.map((l) => (l.productId === id ? { ...l, quantity: Math.min(20, q) } : l))));
  }, []);
  const remove = useCallback((id: string) => setLines((ls) => ls.filter((l) => l.productId !== id)), []);
  const clear = useCallback(() => setLines([]), []);

  const api = useMemo<CartApi>(
    () => ({
      lines,
      ready,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      subtotalMinor: lines.reduce((n, l) => n + l.quantity * l.unitMinor, 0),
      add,
      setQty,
      remove,
      clear,
    }),
    [lines, ready, add, setQty, remove, clear],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart outside CartProvider");
  return v;
}

export function CartCount() {
  const { count, ready } = useCart();
  if (!ready || count === 0) return null;
  return (
    <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-gurans px-1.5 text-[11px] font-bold text-white">
      {count}
    </span>
  );
}
