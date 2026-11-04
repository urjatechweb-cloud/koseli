/**
 * Beta seed — Pokhara only. Idempotent: safe to run on every deploy.
 *   npx prisma db seed
 */
import { PrismaClient } from "@prisma/client";
import { computeRetail } from "../src/server/pricing/margin";

const db = new PrismaClient();

async function main() {
  const cities = [
    { slug: "pokhara", name: "Pokhara", nameNe: "पोखरा", province: "Gandaki", isLive: true },
    { slug: "kathmandu", name: "Kathmandu", nameNe: "काठमाडौं", province: "Bagmati", isLive: false },
    { slug: "lalitpur", name: "Lalitpur", nameNe: "ललितपुर", province: "Bagmati", isLive: false },
  ];
  for (const c of cities) await db.city.upsert({ where: { slug: c.slug }, create: c, update: { isLive: c.isLive } });
  const pokhara = await db.city.findUniqueOrThrow({ where: { slug: "pokhara" } });

  const globalRule = await db.pricingRule.upsert({
    where: { id: "rule_global_20" },
    create: { id: "rule_global_20", name: "Global 20% markup", scope: "GLOBAL", strategy: "MARKUP_ON_COST", basisPoints: 2000, roundToMinor: 1000 },
    update: {},
  });

  const categories = [
    ["cakes", "Cakes", "केक"],
    ["flowers", "Flowers", "फूल"],
    ["hampers", "Gift Hampers", "उपहार ह्याम्पर"],
    ["local-crafts", "Local Crafts", "हस्तकला"],
    ["electronics", "Electronics", "इलेक्ट्रोनिक्स"],
    ["clothing", "Clothing", "लुगा"],
  ] as const;
  for (const [slug, name, nameNe] of categories) await db.category.upsert({ where: { slug }, create: { slug, name, nameNe }, update: {} });

  const occasions = [
    ["dashain", "Dashain"], ["tihar", "Tihar"], ["bhai-tika", "Bhai Tika"], ["teej", "Teej"],
    ["birthday", "Birthday"], ["anniversary", "Anniversary"], ["wedding", "Wedding"], ["pasni", "Pasni"],
  ] as const;
  for (const [slug, name] of occasions) await db.occasion.upsert({ where: { slug }, create: { slug, name }, update: {} });

  for (const [slug, name] of [["mother", "Mother"], ["father", "Father"], ["partner", "Partner"], ["sibling", "Sibling"], ["kids", "Kids"], ["corporate", "Corporate"]] as const) {
    await db.recipientTag.upsert({ where: { slug }, create: { slug, name }, update: {} });
  }

  const vendor = await db.vendor.upsert({
    where: { slug: "lakeside-bakery-demo" },
    create: { slug: "lakeside-bakery-demo", name: "Lakeside Bakery (demo)", cityId: pokhara.id, isVerified: true },
    update: {},
  });

  // Demo products: [slug, title, category, baseCost NPR, sameDayMinutes, perishable, occasions]
  const demo = [
    ["black-forest-1kg", "Black Forest Cake — 1 kg", "cakes", 1450, 180, true, ["birthday", "anniversary"]],
    ["red-roses-12", "12 Red Roses Bouquet", "flowers", 1200, 120, true, ["anniversary", "birthday"]],
    ["tihar-sweets-hamper", "Tihar Sel Roti & Sweets Hamper", "hampers", 2800, 240, true, ["tihar", "bhai-tika"]],
    ["dhaka-topi-classic", "Palpali Dhaka Topi", "local-crafts", 650, 1440, false, ["dashain", "wedding"]],
  ] as const;

  for (const [slug, title, cat, costNpr, minutes, perishable, occ] of demo) {
    const category = await db.category.findUniqueOrThrow({ where: { slug: cat } });
    const product = await db.product.upsert({
      where: { slug },
      create: { slug, title, description: title, categoryId: category.id, status: "ACTIVE", isPerishable: perishable },
      update: {},
    });
    const offer = await db.vendorOffer.upsert({
      where: { vendorId_vendorSku: { vendorId: vendor.id, vendorSku: slug } },
      create: { vendorId: vendor.id, productId: product.id, vendorSku: slug, baseCostMinor: costNpr * 100 },
      update: { baseCostMinor: costNpr * 100 },
    });
    const retailMinor = computeRetail(offer.baseCostMinor, globalRule);
    await db.productPrice.upsert({
      where: { productId: product.id },
      create: { productId: product.id, retailMinor, appliedRuleId: globalRule.id, sourceOfferId: offer.id },
      update: { retailMinor, appliedRuleId: globalRule.id, sourceOfferId: offer.id },
    });
    await db.productCityAvailability.upsert({
      where: { productId_cityId: { productId: product.id, cityId: pokhara.id } },
      create: { productId: product.id, cityId: pokhara.id, minDeliveryMinutes: minutes, sameDayCutoffLocal: perishable ? "16:00" : null, deliveryFeeMinor: 10_000 },
      update: {},
    });
    for (const o of occ) {
      const occasion = await db.occasion.findUniqueOrThrow({ where: { slug: o } });
      await db.productOccasion.upsert({
        where: { productId_occasionId: { productId: product.id, occasionId: occasion.id } },
        create: { productId: product.id, occasionId: occasion.id },
        update: {},
      });
    }
  }
  console.log("Seeded Pokhara beta.");
}

main().finally(() => db.$disconnect());
