import type { Metadata } from "next";
import { listCategories, listOccasions, listProducts, SORTS, type Sort } from "@/server/catalog";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shop gifts" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 80) || undefined;

export default async function Shop({ searchParams }: { searchParams: SP }) {
  const q = one(searchParams.q);
  const category = one(searchParams.category);
  const occasion = one(searchParams.occasion);
  const today = one(searchParams.today) === "1";
  const sortParam = one(searchParams.sort);
  const sort: Sort = SORTS.includes(sortParam as Sort) ? (sortParam as Sort) : "popular";

  const [products, categories, occasions] = await Promise.all([
    listProducts({ q, category, occasion, today, sort }),
    listCategories(),
    listOccasions(),
  ]);

  return (
    <main className="wrap grid gap-8 py-10">
      <div className="grid gap-2">
        <p className="eyebrow">Delivering in Pokhara</p>
        <h1 className="font-display text-4xl">Gifts</h1>
      </div>

      {/* Plain GET form: filters work without JavaScript and every view has a shareable URL. */}
      <form className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end" action="/shop">
        <label className="label" htmlFor="q">
          Search
          <input id="q" name="q" defaultValue={q} placeholder="cake, roses, dhaka topi…" className="field" />
        </label>
        <label className="label" htmlFor="category">
          Category
          <select id="category" name="category" defaultValue={category ?? ""} className="field">
            <option value="">All</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label className="label" htmlFor="occasion">
          Occasion
          <select id="occasion" name="occasion" defaultValue={occasion ?? ""} className="field">
            <option value="">Any</option>
            {occasions.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
          </select>
        </label>
        <label className="label" htmlFor="sort">
          Sort
          <select id="sort" name="sort" defaultValue={sort} className="field">
            <option value="popular">Popular</option>
            <option value="fastest">Fastest delivery</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-1">
          <label htmlFor="today" className="flex items-center gap-2 text-sm font-semibold">
            <input id="today" type="checkbox" name="today" value="1" defaultChecked={today} className="h-4 w-4 accent-[rgb(var(--gurans))]" />
            Today
          </label>
          <button className="btn-primary" type="submit">Apply</button>
        </div>
      </form>

      <p className="text-sm text-muted" aria-live="polite">
        {products.length} {products.length === 1 ? "gift" : "gifts"}
        {today ? " delivered today" : ""}
      </p>

      {products.length === 0 ? (
        <div className="grid gap-2 rounded-xl border border-dashed border-line p-10 text-center">
          <p className="font-semibold">Nothing matches those filters.</p>
          <a href="/shop" className="text-sm text-gurans underline underline-offset-4">Clear filters</a>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      )}
    </main>
  );
}
