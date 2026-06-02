// Seed sample mandi (commodity market) rates for the four Rayalaseema
// districts. Idempotent: re-running upserts on (commodityEn, marketEn, date)
// so a daily cron / manual re-seed never duplicates rows for the same day.
//
// Run:
//   cd packages/db && bunx tsx scripts/seed-mandi-rates.ts
//
// After running, the homepage strip's "మండి" section appears with these rows,
// and editors can manage them in admin at /mandi.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface Seed {
  commodity: string;   // Telugu
  commodityEn: string;
  market: string;      // Telugu
  marketEn: string;
  price: number;       // rupees per quintal
  change: number;      // daily change percent
}

// Indicative price ranges current as of May 2026 - editors should refresh
// daily via the admin UI. Quintal (= 100 kg) is the standard Indian APMC
// reporting unit, matching the "క్వింటల్" default unit in the schema.
const SEED: Seed[] = [
  // Kurnool
  { commodity: "మిర్చి", commodityEn: "Chilli", market: "కర్నూలు", marketEn: "Kurnool", price: 24500, change: 1.2 },
  { commodity: "పత్తి", commodityEn: "Cotton", market: "కర్నూలు", marketEn: "Kurnool", price: 7350, change: -0.4 },
  { commodity: "వేరుశనగ", commodityEn: "Groundnut", market: "కర్నూలు", marketEn: "Kurnool", price: 6420, change: 0.6 },
  // Anantapur
  { commodity: "వేరుశనగ", commodityEn: "Groundnut", market: "అనంతపురం", marketEn: "Anantapur", price: 6380, change: 0.3 },
  { commodity: "పత్తి", commodityEn: "Cotton", market: "అనంతపురం", marketEn: "Anantapur", price: 7290, change: -0.6 },
  // Kadapa
  { commodity: "మిర్చి", commodityEn: "Chilli", market: "కడప", marketEn: "Kadapa", price: 23800, change: 0.8 },
  { commodity: "వరి", commodityEn: "Paddy", market: "కడప", marketEn: "Kadapa", price: 2310, change: 0 },
  // Chittoor
  { commodity: "వరి", commodityEn: "Paddy", market: "చిత్తూరు", marketEn: "Chittoor", price: 2280, change: -0.2 },
  { commodity: "కందులు", commodityEn: "Toor Dal", market: "చిత్తూరు", marketEn: "Chittoor", price: 9450, change: 1.1 },
];

async function main() {
  // Snap "date" to today's midnight so re-running on the same day updates
  // (not duplicates) the rows. Existing rows from previous days are left as
  // history.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let upserts = 0;
  for (const s of SEED) {
    // No composite unique on (commodityEn, marketEn, date) in the schema, so
    // do a manual find-then-update / create to keep idempotency.
    const existing = await prisma.mandiPrice.findFirst({
      where: {
        commodityEn: s.commodityEn,
        marketEn: s.marketEn,
        date: { gte: today },
      },
    });
    if (existing) {
      await prisma.mandiPrice.update({
        where: { id: existing.id },
        data: { price: s.price, change: s.change, active: true },
      });
    } else {
      await prisma.mandiPrice.create({
        data: {
          commodity: s.commodity,
          commodityEn: s.commodityEn,
          market: s.market,
          marketEn: s.marketEn,
          price: s.price,
          change: s.change,
          date: today,
          active: true,
        },
      });
    }
    upserts++;
  }
  console.log(`Seeded ${upserts} mandi rows for ${today.toDateString()}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
