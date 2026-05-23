// Phase 2 — remap mandals & articles from old 78 wrong constituencies to the new 55 correct ACs,
// then delete the old rows and rename slugs to `<english-slug>-<acNumber>`.
//
// Idempotent: safe to re-run. Wraps everything in a transaction.
//
// Run from packages/db:  bunx tsx scripts/remap-constituencies.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Manual overrides for old AC names that don't match new ones (SC suffix variants + typos).
// Maps old `nameEn` (exact) → new acNumber.
const NAME_OVERRIDES: Record<string, number> = {
  "Singanamala (SC)": 152,
  "Kodur (SC)": 127,
  "Gangadhara Nellore (SC)": 171,
  "Piler": 163,
  "Puthalapattu (SC)": 173,
  "Kodumur (SC)": 143,
  "Nandikotkur (SC)": 136,
  "Madakasira (SC)": 156,
  "Gudur (SC)": 120,
  "Satyavedu (SC)": 169,
  "Sullurpeta (SC)": 121,
  "Badvel (SC)": 124,
  // Prod-only legacy rows (different historical state than local)
  "Kurnool City": 137,            // city variant → Kurnool AC
  "Banaganapalli": 140,           // spelling variant → Banaganapalle
  "Koilkuntla": 140,              // defunct AC (dissolved 2009 delimitation); town now in Banaganapalle AC
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function main() {
  const oldACs = await prisma.constituency.findMany({
    where: { acNumber: null },
    select: { id: true, nameEn: true, slug: true },
  });

  const newACs = await prisma.constituency.findMany({
    where: { acNumber: { not: null } },
    select: { id: true, nameEn: true, acNumber: true },
  });

  const newByName = new Map<string, typeof newACs[number]>();
  const newByAcNo = new Map<number, typeof newACs[number]>();
  for (const n of newACs) {
    newByName.set(norm(n.nameEn), n);
    newByAcNo.set(n.acNumber!, n);
  }

  // Build oldId → newId map. Fail loudly if anything is still unmatched.
  const remap = new Map<string, { newId: string; newSlug: string; newAcNo: number; newNameEn: string }>();
  const unresolved: string[] = [];

  for (const o of oldACs) {
    const override = NAME_OVERRIDES[o.nameEn];
    const target = override !== undefined ? newByAcNo.get(override) : newByName.get(norm(o.nameEn));
    if (!target) {
      unresolved.push(`${o.nameEn} (${o.slug})`);
      continue;
    }
    remap.set(o.id, {
      newId: target.id,
      newSlug: `${toSlug(target.nameEn)}-${target.acNumber}`,
      newAcNo: target.acNumber!,
      newNameEn: target.nameEn,
    });
  }

  if (unresolved.length > 0) {
    console.error("Cannot remap — unresolved old ACs:");
    for (const u of unresolved) console.error("  " + u);
    process.exit(1);
  }

  if (remap.size === 0) {
    console.log("Nothing to remap — DB already in clean state (no acNumber=null rows). Done.");
    return;
  }

  console.log(`Remap plan: ${remap.size} old ACs → ${new Set([...remap.values()].map(v => v.newId)).size} new ACs`);

  // Counts before
  const beforeMandals = await prisma.mandal.count({ where: { constituencyId: { in: [...remap.keys()] } } });
  const beforeArticles = await prisma.article.count({ where: { constituencyId: { in: [...remap.keys()] } } });
  console.log(`Will remap: ${beforeMandals} mandals, ${beforeArticles} articles`);

  // Do it. Single transaction so any failure rolls back.
  await prisma.$transaction(async (tx) => {
    // 1. Remap mandals
    for (const [oldId, t] of remap) {
      await tx.mandal.updateMany({
        where: { constituencyId: oldId },
        data: { constituencyId: t.newId },
      });
    }

    // 2. Remap articles
    for (const [oldId, t] of remap) {
      await tx.article.updateMany({
        where: { constituencyId: oldId },
        data: { constituencyId: t.newId },
      });
    }

    // 3. Delete old constituencies (now have zero mandals & zero articles)
    const del = await tx.constituency.deleteMany({
      where: { id: { in: [...remap.keys()] } },
    });
    console.log(`Deleted ${del.count} old constituency rows`);

    // 4. Rename new slugs from `new-ac-NN` → `<english-slug>-NN`
    for (const n of newACs) {
      const cleanSlug = `${toSlug(n.nameEn)}-${n.acNumber}`;
      await tx.constituency.update({
        where: { id: n.id },
        data: { slug: cleanSlug },
      });
    }
    console.log(`Renamed ${newACs.length} slugs to clean form`);
  }, { timeout: 60_000 });

  // Verify
  const finalCount = await prisma.constituency.count();
  const stillOld = await prisma.constituency.count({ where: { acNumber: null } });
  console.log(`Done. Constituencies in DB: ${finalCount} (expected 55), without acNumber: ${stillOld} (expected 0)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
