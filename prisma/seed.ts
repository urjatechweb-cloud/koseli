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

  // Demo products: [slug, title, titleNe, category, baseCost NPR, deliveryMinutes, perishable, occasions, description]
  const demo: [string, string, string, string, number, number, boolean, string[], string][] = [
    ["black-forest-1kg", "Black Forest Cake, 1 kg", "ब्ल्याक फरेस्ट केक", "cakes", 1450, 180, true, ["birthday", "anniversary"], "Chocolate sponge, whipped cream and cherries, baked fresh in Lakeside the morning it is delivered. Name on top free of charge."],
    ["red-velvet-1kg", "Red Velvet Cake, 1 kg", "रेड भेल्भेट केक", "cakes", 1650, 180, true, ["birthday", "anniversary", "wedding"], "Cream-cheese frosted red velvet. Eggless on request."],
    ["chocolate-truffle-half-kg", "Chocolate Truffle Cake, ½ kg", "चकलेट ट्रफल केक", "cakes", 950, 180, true, ["birthday"], "Dense dark-chocolate ganache cake, a good size for two to four people."],
    ["red-roses-12", "12 Red Roses Bouquet", "१२ रातो गुलाफ", "flowers", 1200, 120, true, ["anniversary", "birthday"], "Twelve long-stem red roses wrapped in kraft paper with a handwritten card."],
    ["sunflower-bunch", "Sunflower and Gerbera Bunch", "सूर्यमुखी फूल", "flowers", 1100, 120, true, ["birthday", "teej"], "Bright sunflowers and gerberas from Pokhara growers, arranged the day of delivery."],
    ["sayapatri-mala", "Sayapatri Marigold Garlands, set of 3", "सयपत्री माला", "flowers", 450, 240, true, ["tihar", "bhai-tika", "dashain"], "Fresh marigold malas for doorways, puja or Bhai Tika."],
    ["tihar-sweets-hamper", "Tihar Sel Roti and Sweets Hamper", "तिहार सेल रोटी र मिठाई", "hampers", 2800, 240, true, ["tihar", "bhai-tika"], "Sel roti, anarasa, laddu and dry fruits in a reusable doko-style basket."],
    ["dashain-family-hamper", "Dashain Family Hamper", "दशैं ह्याम्पर", "hampers", 4200, 1440, false, ["dashain"], "Basmati rice, ghee, dry fruits, tea and spices for the household, packed for Dashain."],
    ["dhaka-topi-classic", "Palpali Dhaka Topi", "पाल्पाली ढाका टोपी", "local-crafts", 650, 1440, false, ["dashain", "wedding"], "Hand-woven Dhaka cloth from Palpa, stitched into a classic topi."],
    ["pashmina-shawl", "Pure Pashmina Shawl", "पश्मिना सल", "local-crafts", 5200, 1440, false, ["teej", "wedding", "anniversary"], "Soft hand-loomed Chyangra pashmina in plum, with fringed ends."],
    ["lokta-journal", "Lokta Paper Journal", "लोक्ता कागज डायरी", "local-crafts", 520, 1440, false, ["birthday"], "Handmade lokta paper bound in a printed cover. Takes ink beautifully."],
    ["singing-bowl-small", "Hand-hammered Singing Bowl", "सिङ्गिङ बोल", "local-crafts", 2400, 2880, false, ["wedding", "anniversary"], "Small bronze bowl with wooden striker and cushion, made in the Kathmandu valley."],
  ];

  for (const [slug, title, titleNe, cat, costNpr, minutes, perishable, occ, description] of demo) {
    const category = await db.category.findUniqueOrThrow({ where: { slug: cat } });
    const product = await db.product.upsert({
      where: { slug },
      create: { slug, title, titleNe, description, categoryId: category.id, status: "ACTIVE", isPerishable: perishable },
      update: { title, titleNe, description },
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
