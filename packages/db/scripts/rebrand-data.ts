// One-time data rebrand: rewrites the user-facing brand strings that live IN
// the database (not in code) from "Rayalaseema Express" / "రాయలసీమ ఎక్స్‌ప్రెస్"
// to "Rayalaseema News" / "రాయలసీమ న్యూస్".
//
// Touches ONLY brand text fields. Does NOT rename the database, drop anything,
// or alter any other column. Safe + idempotent (running twice is a no-op).
//
// Dry run (default, writes nothing):   bunx tsx scripts/rebrand-data.ts
// Apply (wrapped in a transaction):    bunx tsx scripts/rebrand-data.ts --apply
//
// Connects via DATABASE_URL in the environment - point it at whichever DB you
// intend (local or server). ALWAYS take a pg_dump backup before --apply.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// Telugu "ఎక్స్‌ప్రెస్" (with or without ZWNJ/space) -> "న్యూస్"; English + domain.
function rebrand(s: string): string {
  return s
    .replace(/ఎక్స్[‌ ]?ప్రెస్/g, "న్యూస్")
    .replace(/Rayalaseema Express/g, "Rayalaseema News")
    .replace(/rayalaseemaexpress\.com/g, "rayalaseemanews.com");
}

async function main() {
  console.log(`\n=== rebrand-data (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);
  const changes: Array<() => Promise<unknown>> = [];

  // ---- desks.name + desks.nameEn ----
  const desks = await prisma.desk.findMany({ select: { id: true, name: true, nameEn: true } });
  let deskHits = 0;
  for (const d of desks) {
    const name = rebrand(d.name);
    const nameEn = rebrand(d.nameEn);
    if (name !== d.name || nameEn !== d.nameEn) {
      deskHits++;
      console.log(`desk ${d.id}`);
      if (name !== d.name) console.log(`  name:   "${d.name}"  ->  "${name}"`);
      if (nameEn !== d.nameEn) console.log(`  nameEn: "${d.nameEn}"  ->  "${nameEn}"`);
      changes.push(() => prisma.desk.update({ where: { id: d.id }, data: { name, nameEn } }));
    }
  }
  console.log(`desks: ${deskHits} row(s) to update\n`);

  // ---- site_config.value ----
  const cfg = await prisma.siteConfig.findMany({ select: { id: true, key: true, value: true } });
  let cfgHits = 0;
  for (const c of cfg) {
    const value = rebrand(c.value);
    if (value !== c.value) {
      cfgHits++;
      console.log(`site_config "${c.key}"`);
      console.log(`  "${c.value}"  ->  "${value}"`);
      changes.push(() => prisma.siteConfig.update({ where: { id: c.id }, data: { value } }));
    }
  }
  console.log(`site_config: ${cfgHits} row(s) to update\n`);

  if (!APPLY) {
    console.log(`DRY RUN - nothing written. Re-run with --apply (after a backup) to commit ${changes.length} update(s).`);
    return;
  }
  if (changes.length === 0) {
    console.log("Nothing to update. (Already rebranded?)");
    return;
  }
  await prisma.$transaction(changes.map((fn) => fn()) as any);
  console.log(`APPLIED ${changes.length} update(s) in a single transaction.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
