// Inspect: which old (acNumber=null) constituencies exist, what they map to.
// Read-only - prints a table for review before Phase 2 remap.
//
// Run from packages/db:  bunx tsx scripts/inspect-old-acs.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function main() {
  const oldACs = await prisma.constituency.findMany({
    where: { acNumber: null },
    include: {
      district: { select: { slug: true, nameEn: true } },
      _count: { select: { mandals: true, articles: true } },
    },
    orderBy: [{ district: { nameEn: "asc" } }, { nameEn: "asc" }],
  });

  const newACs = await prisma.constituency.findMany({
    where: { acNumber: { not: null } },
    select: { id: true, nameEn: true, acNumber: true, district: { select: { slug: true } } },
  });

  const newByName = new Map<string, typeof newACs[number]>();
  for (const n of newACs) newByName.set(norm(n.nameEn), n);

  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const o of oldACs) {
    const match = newByName.get(norm(o.nameEn));
    const line = `${o.district.slug.padEnd(16)} ${o.nameEn.padEnd(22)} mandals=${o._count.mandals.toString().padStart(3)} articles=${o._count.articles.toString().padStart(4)}`;
    if (match) {
      matched.push(`${line} → AC ${match.acNumber} ${match.nameEn}`);
    } else {
      unmatched.push(line);
    }
  }

  console.log(`\n=== MATCHED (${matched.length}) ===`);
  for (const l of matched) console.log(l);

  console.log(`\n=== UNMATCHED (${unmatched.length}) - need manual review ===`);
  for (const l of unmatched) console.log(l);

  console.log(`\nTotals: old=${oldACs.length}, new=${newACs.length}, matched=${matched.length}, unmatched=${unmatched.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
