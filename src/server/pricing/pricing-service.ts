import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeRetail, resolveRule, type MarginRule } from "./margin";

/**
 * Ingestion middleware: every vendor price that enters the system (manual
 * upload, CSV, scraper, partner API) goes through `ingestVendorPrice`. It
 * stores the private cost, re-runs the margin engine, and materializes the
 * public retail price — atomically.
 */
export interface VendorPriceInput {
  vendorId: string;
  productId: string;
  vendorSku: string;
  baseCostMinor: number; // NPR paisa
  stockQty?: number | null;
  sourceUrl?: string | null;
}

export async function ingestVendorPrice(input: VendorPriceInput) {
  return prisma.$transaction(async (tx) => {
    await tx.vendorOffer.upsert({
      where: { vendorId_vendorSku: { vendorId: input.vendorId, vendorSku: input.vendorSku } },
      create: {
        vendorId: input.vendorId,
        productId: input.productId,
        vendorSku: input.vendorSku,
        baseCostMinor: input.baseCostMinor,
        stockQty: input.stockQty ?? null,
        sourceUrl: input.sourceUrl ?? null,
      },
      update: {
        baseCostMinor: input.baseCostMinor,
        stockQty: input.stockQty ?? null,
        sourceUrl: input.sourceUrl ?? null,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });
    return repriceProduct(tx, input.productId, "vendor_ingest");
  });
}

/**
 * Recompute the public price for one product. Call after any offer change or
 * pricing-rule change (fan out over affected products from a queue worker).
 */
export async function repriceProduct(tx: Prisma.TransactionClient, productId: string, reason: string) {
  const product = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    select: { id: true, categoryId: true },
  });

  // Cost basis = cheapest active, in-stock (or untracked-stock) offer.
  const offer = await tx.vendorOffer.findFirst({
    where: {
      productId,
      isActive: true,
      vendor: { isActive: true },
      OR: [{ stockQty: null }, { stockQty: { gt: 0 } }],
    },
    orderBy: { baseCostMinor: "asc" },
    select: { id: true, vendorId: true, baseCostMinor: true },
  });

  if (!offer) {
    await tx.product.update({ where: { id: productId }, data: { status: "OUT_OF_STOCK" } });
    return null;
  }

  const rules = (await tx.pricingRule.findMany({
    where: {
      isActive: true,
      OR: [
        { scope: "GLOBAL" },
        { scope: "PRODUCT", productId },
        { scope: "CATEGORY", categoryId: product.categoryId },
        { scope: "VENDOR", vendorId: offer.vendorId },
        { scope: "VENDOR_CATEGORY", vendorId: offer.vendorId, categoryId: product.categoryId },
      ],
    },
  })) as MarginRule[];

  const rule = resolveRule(rules, { productId, categoryId: product.categoryId, vendorId: offer.vendorId });
  const retailMinor = computeRetail(offer.baseCostMinor, rule);

  const price = await tx.productPrice.upsert({
    where: { productId },
    create: { productId, retailMinor, appliedRuleId: rule.id, sourceOfferId: offer.id },
    update: { retailMinor, appliedRuleId: rule.id, sourceOfferId: offer.id, computedAt: new Date() },
  });

  await tx.priceHistory.create({
    data: {
      productId,
      offerId: offer.id,
      ruleId: rule.id,
      baseCostMinor: offer.baseCostMinor,
      retailMinor,
      reason,
    },
  });

  // Signal search re-index (Algolia/Elasticsearch worker watches searchVersion).
  await tx.product.update({ where: { id: productId }, data: { searchVersion: { increment: 1 } } });

  return price;
}

/**
 * The ONLY shape the storefront / tRPC public router may return. Explicit
 * allow-list: adding a column to ProductPrice or VendorOffer can never leak it.
 */
export const publicProductSelect = {
  id: true,
  slug: true,
  title: true,
  titleNe: true,
  description: true,
  kind: true,
  status: true,
  isPerishable: true,
  model3dUrl: true,
  category: { select: { slug: true, name: true } },
  images: { select: { url: true, alt: true }, orderBy: { sortOrder: "asc" } },
  price: { select: { retailMinor: true, compareAtMinor: true, currency: true } },
} satisfies Prisma.ProductSelect;

export type PublicProduct = Prisma.ProductGetPayload<{ select: typeof publicProductSelect }>;
