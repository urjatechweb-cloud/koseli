import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct } from "@/server/catalog";
import { ProductArt } from "@/components/art";
import { AddToCart } from "@/components/add-to-cart";
import { deliveryLabel, rs } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await getProduct(params.slug);
  return { title: p?.title ?? "Gift not found" };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const p = await getProduct(params.slug);
  if (!p || !p.price) notFound();
  const avail = p.availability[0];

  return (
    <main className="wrap grid gap-10 py-10 md:grid-cols-2">
      <div className="overflow-hidden rounded-2xl border border-line">
        <ProductArt category={p.category.slug} slug={p.slug} title={p.title} />
      </div>
      <div className="grid content-start gap-6">
        <nav className="text-sm text-muted">
          <Link href="/shop" className="hover:text-ink">Gifts</Link> /{" "}
          <Link href={`/shop?category=${p.category.slug}`} className="hover:text-ink">{p.category.name}</Link>
        </nav>
        <div className="grid gap-2">
          <h1 className="font-display text-4xl leading-tight">{p.title}</h1>
          {p.titleNe && <p lang="ne" className="font-display text-xl text-gurans">{p.titleNe}</p>}
        </div>
        <p className="font-mono text-3xl tabular-nums">{rs(p.price.retailMinor)}</p>

        {avail ? (
          <dl className="grid gap-2 rounded-xl border border-line bg-surface p-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">Delivery in Pokhara</dt><dd className="font-semibold">{deliveryLabel(avail.minDeliveryMinutes)}</dd></div>
            {avail.sameDayCutoffLocal && (
              <div className="flex justify-between gap-4"><dt className="text-muted">Same-day orders close</dt><dd className="font-semibold">{avail.sameDayCutoffLocal} Nepal time</dd></div>
            )}
            <div className="flex justify-between gap-4"><dt className="text-muted">Delivery fee</dt><dd className="font-mono">{rs(avail.deliveryFeeMinor)}</dd></div>
          </dl>
        ) : (
          <p className="rounded-xl bg-gurans-soft p-4 text-sm">Not available for delivery in Pokhara right now.</p>
        )}

        {avail && (
          <AddToCart line={{ productId: p.id, slug: p.slug, title: p.title, category: p.category.slug, unitMinor: p.price.retailMinor }} />
        )}

        <p className="max-w-[60ch] text-muted">{p.description}</p>

        {p.occasions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {p.occasions.map(({ occasion }) => (
              <Link key={occasion.slug} href={`/shop?occasion=${occasion.slug}`} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:border-marigold">
                {occasion.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
