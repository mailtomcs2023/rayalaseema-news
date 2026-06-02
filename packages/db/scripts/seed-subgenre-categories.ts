// Idempotent seed for the cinema + sports sub-genre categories used by the
// homepage CinemaBand / SectionBand filter tabs.
//
// Why a separate script: most of these (tollywood/bollywood/hollywood/cricket)
// were added by editors via the admin UI and are NOT in seed-categories.ts, so
// they live only in whatever DB they were created in. `tv` and `ipl` were never
// created at all - the homepage tabs reference them but no category exists. This
// upserts the whole set so every environment (and a fresh DB) has them.
//
// Idempotent: upsert by slug. Re-running updates name/color, never duplicates.
// Note: these categories start EMPTY - the filter tabs only show articles once
// stories are assigned to them (in the admin, or via a keyword backfill).
//
// Run via: bunx tsx packages/db/scripts/seed-subgenre-categories.ts

import { prisma } from "../src/index";

const SUBGENRES = [
  // Cinema sub-genres (filter the సినిమా / CinemaBand)
  { name: "టాలీవుడ్", nameEn: "Tollywood", slug: "tollywood", color: "#DB2777", sortOrder: 40 },
  { name: "బాలీవుడ్", nameEn: "Bollywood", slug: "bollywood", color: "#E11D48", sortOrder: 41 },
  { name: "హాలీవుడ్", nameEn: "Hollywood", slug: "hollywood", color: "#9333EA", sortOrder: 42 },
  { name: "టీవీ", nameEn: "TV", slug: "tv", color: "#0EA5E9", sortOrder: 43 },
  // Sports sub-genres (filter the క్రీడలు / sports SectionBand)
  { name: "క్రికెట్", nameEn: "Cricket", slug: "cricket", color: "#16A34A", sortOrder: 44 },
  { name: "ఐపీఎల్", nameEn: "IPL", slug: "ipl", color: "#2563EB", sortOrder: 45 },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const cat of SUBGENRES) {
    const existing = await prisma.category.findUnique({ where: { slug: cat.slug }, select: { id: true } });
    await prisma.category.upsert({ where: { slug: cat.slug }, update: cat, create: cat });
    if (existing) {
      updated++;
      console.log(`  ~ ${cat.slug} (${cat.name}) - updated`);
    } else {
      created++;
      console.log(`  ✓ ${cat.slug} (${cat.name}) - created`);
    }
  }
  console.log(`[seed-subgenre-categories] Done. ${created} created, ${updated} updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
