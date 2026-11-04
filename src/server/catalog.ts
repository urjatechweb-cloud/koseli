import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicProductSelect } from "./pricing/pricing-service";

export const BETA_CITY = "pokhara";

export const SORTS = ["popular", "price-asc", "price-desc", "fastest"] as const;
export type Sort = (typeof SORTS)[number];

export interface CatalogFilters {
  q?: string;
  category?: string;
  occasion?: string;
  city?: string;
  today?: boolean; // deliverable within 6 hours
  sort?: Sort;
}

/** Customer-facing product shape: public fields + delivery info for one city. Never includes cost. */
export const cardSelect = (citySlug: string) =>
  ({
    ...publicProductSelect,
    availability: {
      where: { city: { slug: citySlug }, isAvailable: true },
      select: { minDeliveryMinutes: true, deliveryFeeMinor: true, sameDayCutoffLocal: true },
    },
    occasions: { select: { occasion: { select: { slug: true, name: true } } } },
  }) satisfies Prisma.ProductSelect;

export type CatalogProduct = Prisma.ProductGetPayload<{ select: ReturnType<typeof cardSelect> }>;

export async function listProducts(f: CatalogFilters = {}): Promise<CatalogProduct[]> {
  const city = f.city ?? BETA_CITY;
  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    price: { isNot: null },
    availability: {
      some: {
        city: { slug: city },
        isAvailable: true,
        ...(f.today ? { minDeliveryMinutes: { lte: 360 } } : {}),
      },
    },
    ...(f.category ? { category: { slug: f.category } } : {}),
    ...(f.occasion ? { occasions: { some: { occasion: { slug: f.occasion } } } } : {}),
    ...(f.q
      ? {
          OR: [
            { title: { contains: f.q, mode: "insensitive" } },
            { titleNe: { contains: f.q } },
            { description: { contains: f.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  // "Popular" puts same-day gifts (cakes, flowers) first until we have real sales data.
  const orderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] =
    f.sort === "price-asc"
      ? { price: { retailMinor: "asc" } }
      : f.sort === "price-desc"
        ? { price: { retailMinor: "desc" } }
        : [{ isPerishable: "desc" }, { updatedAt: "desc" }];

  const rows = await prisma.product.findMany({ where, orderBy, select: cardSelect(city), take: 60 });
  if (f.sort === "fastest") {
    rows.sort((a, b) => (a.availability[0]?.minDeliveryMinutes ?? 1e9) - (b.availability[0]?.minDeliveryMinutes ?? 1e9));
  }
  return rows;
}

export function getProduct(slug: string, city = BETA_CITY) {
  return prisma.product.findFirst({ where: { slug, status: "ACTIVE" }, select: cardSelect(city) });
}

export function listCategories() {
  return prisma.category.findMany({
    where: { products: { some: { status: "ACTIVE" } } },
    select: { slug: true, name: true, nameNe: true },
    orderBy: { sortOrder: "asc" },
  });
}

export function listOccasions() {
  return prisma.occasion.findMany({ select: { slug: true, name: true, nameNe: true }, orderBy: { name: "asc" } });
}

export function liveCities() {
  return prisma.city.findMany({ where: { isLive: true }, select: { id: true, slug: true, name: true } });
}
