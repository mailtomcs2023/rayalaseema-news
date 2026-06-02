#!/usr/bin/env bun
/**
 * Seed the `mandals` table from packages/db/prisma/location-data.json.
 *
 * JSON shape: districts[].constituencies[].mandals[] (string array of English names).
 * For each mandal string we upsert by slug. Telugu names start as English
 * placeholders — run packages/db/scripts/backfill-mandal-telugu.ts afterwards
 * to fill the real Telugu names via Azure OpenAI transliteration.
 *
 * Idempotent: upsert by slug. Safe to re-run.
 *
 * Run:
 *   bun packages/db/scripts/seed-mandals.ts            # dry-run
 *   bun packages/db/scripts/seed-mandals.ts --apply    # write
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@rayalaseema/db";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

type LocData = {
  districts: Array<{
    nameEn: string;
    slug: string;
    constituencies: Array<{
      nameEn: string;
      number: number;
      mandals: string[];
    }>;
  }>;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function main() {
  const json = JSON.parse(readFileSync("packages/db/prisma/location-data.json", "utf8")) as LocData;

  // Load existing constituencies by ECI number (most reliable join key)
  const constituencies = await prisma.constituency.findMany({
    select: { id: true, nameEn: true, acNumber: true, slug: true, districtId: true },
  });
  const byAcNumber = new Map(constituencies.map((c) => [c.acNumber, c]));
  const byNameEn = new Map(constituencies.map((c) => [c.nameEn.toLowerCase(), c]));

  let plannedUpserts = 0;
  let unmatchedConstituencies: string[] = [];
  const ops: Array<{ slug: string; nameEn: string; constituencyId: string; sortOrder: number }> = [];

  for (const d of json.districts) {
    for (const con of d.constituencies) {
      const con_record =
        byAcNumber.get(con.number) ?? byNameEn.get(con.nameEn.toLowerCase());
      if (!con_record) {
        unmatchedConstituencies.push(`${d.nameEn} > ${con.nameEn} (#${con.number})`);
        continue;
      }
      con.mandals.forEach((mandalName, i) => {
        ops.push({
          slug: slugify(mandalName),
          nameEn: mandalName,
          constituencyId: con_record.id,
          sortOrder: i,
        });
        plannedUpserts++;
      });
    }
  }

  console.log(`Plan: upsert ${plannedUpserts} mandals across ${json.districts.length} districts`);
  if (unmatchedConstituencies.length) {
    console.warn(`  Warning: ${unmatchedConstituencies.length} constituencies in JSON not found in DB:`);
    for (const u of unmatchedConstituencies.slice(0, 10)) console.warn(`    - ${u}`);
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to write.");
    return;
  }

  let created = 0,
    updated = 0;
  for (const op of ops) {
    const r = await prisma.mandal.upsert({
      where: { slug: op.slug },
      create: {
        slug: op.slug,
        nameEn: op.nameEn,
        name: op.nameEn, // Telugu placeholder — backfill via backfill-mandal-telugu.ts
        constituencyId: op.constituencyId,
        sortOrder: op.sortOrder,
        active: true,
      },
      update: {
        nameEn: op.nameEn,
        constituencyId: op.constituencyId,
        sortOrder: op.sortOrder,
      },
    });
    if (r.createdAt.getTime() > Date.now() - 5000) created++;
    else updated++;
  }
  console.log(`\n✓ Done. created=${created} updated=${updated}`);
  console.log("Next: bun packages/db/scripts/backfill-mandal-telugu.ts --apply  # fills Telugu names");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
