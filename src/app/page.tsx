import Link from "next/link";
import { listOccasions, listProducts } from "@/server/catalog";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

const FEATURED_OCCASIONS = ["birthday", "anniversary", "tihar", "bhai-tika", "dashain", "teej", "wedding", "pasni"];

export default async function Home() {
  const [products, occasions] = await Promise.all([listProducts({ sort: "popular" }), listOccasions()]);
  const occ = FEATURED_OCCASIONS.map((s) => occasions.find((o) => o.slug === s)).filter(Boolean) as typeof occasions;

  return (
    <main>
      <section className="wrap grid gap-10 py-12 md:grid-cols-[1.2fr_1fr] md:items-center md:py-16">
        <div className="grid gap-5">
          <p className="eyebrow">Now delivering in Pokhara</p>
          <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">
            Send a <span className="text-gurans">koseli</span> home.
          </h1>
          <p className="max-w-[52ch] text-lg text-muted">
            Cakes, flowers, festival hampers and Nepali crafts, delivered to the people you miss. Pay from Nepal with Fonepay,
            or from abroad by card in your own currency.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/shop?today=1" className="btn-primary">Deliver today</Link>
            <Link href="/shop" className="btn-ghost">Browse all gifts</Link>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3 text-sm">
          {[
            ["Same-day cakes and flowers", "Order before 4 pm Nepal time"],
            ["Paying from abroad", "USD, GBP, AUD, EUR, CAD, AED, QAR, JPY, KRW"],
            ["Gift message included", "Handwritten card with every order"],
            ["Local makers", "Pokhara bakeries, florists and craft shops"],
          ].map(([t, d]) => (
            <li key={t} className="grid gap-1 rounded-xl border border-line bg-surface p-4">
              <span className="font-semibold">{t}</span>
              <span className="text-muted">{d}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="wrap grid gap-4 py-6">
        <h2 className="font-display text-3xl">Shop by occasion</h2>
        <div className="flex flex-wrap gap-2">
          {occ.map((o) => (
            <Link key={o.slug} href={`/shop?occasion=${o.slug}`} className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-marigold hover:bg-marigold-soft">
              {o.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap grid gap-6 py-8">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl">Popular in Pokhara</h2>
          <Link href="/shop" className="text-sm font-semibold text-gurans underline underline-offset-4">See all</Link>
        </div>
        {products.length === 0 ? (
          <p className="text-muted">No gifts listed yet. Run the seed to load the Pokhara demo catalogue.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {products.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        )}
      </section>

      <section className="wrap py-10">
        <div className="grid gap-6 rounded-2xl bg-ink p-8 text-bg md:grid-cols-3">
          <h2 className="font-display text-3xl md:col-span-3">How it works</h2>
          {[
            ["Pick a gift", "Filter by occasion, who it's for, and how soon it needs to arrive."],
            ["Tell us where", "Your recipient's name, phone and a landmark. Addresses in Nepal need one."],
            ["Pay your way", "Scan a Fonepay QR in Nepal, or pay by card or Apple Pay from abroad."],
          ].map(([t, d]) => (
            <div key={t} className="grid gap-2">
              <h3 className="font-semibold text-marigold">{t}</h3>
              <p className="text-bg/80">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
