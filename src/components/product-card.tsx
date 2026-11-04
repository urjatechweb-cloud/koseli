import Link from "next/link";
import type { CatalogProduct } from "@/server/catalog";
import { deliveryLabel, rs } from "@/lib/money";
import { ProductArt } from "./art";

export function ProductCard({ p }: { p: CatalogProduct }) {
  const avail = p.availability[0];
  return (
    <Link href={`/p/${p.slug}`} className="group grid min-w-0 content-start gap-3">
      <div className="overflow-hidden rounded-xl border border-line">
        <ProductArt category={p.category.slug} slug={p.slug} title={p.title} className="transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none" />
      </div>
      <div className="grid gap-1">
        <h3 className="font-semibold leading-snug group-hover:text-gurans">{p.title}</h3>
        <p className="font-mono text-[15px] tabular-nums">{p.price ? rs(p.price.retailMinor) : ""}</p>
        {avail && <p className="text-xs text-muted">{deliveryLabel(avail.minDeliveryMinutes)}</p>}
      </div>
    </Link>
  );
}
