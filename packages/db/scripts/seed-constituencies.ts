// Standalone CLI: idempotently provision the 55 Rayalaseema constituencies with
// CLEAN slugs (the ones the public /[district]/[constituency] routes expect).
// Non-destructive - never deletes; safe to re-run on any DB including production.
//
//   cd packages/db && bunx tsx scripts/seed-constituencies.ts
//
// Mandals are seeded separately by scripts/seed-mandals.ts (run it after this).

import { PrismaClient } from "@prisma/client";
import { seedConstituencies } from "./_constituency-data";

const prisma = new PrismaClient();

seedConstituencies(prisma)
  .then(() => console.log("✓ Constituencies provisioned."))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
