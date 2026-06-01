// Backfill `Article.deskId` for every article that doesn't have one set.
// Uses the same fallback chain as the create/update APIs.
// Idempotent - re-running is a no-op once everything is backfilled.
//
// Run from packages/db:  bunx tsx scripts/backfill-desks.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resolveDeskId(input: {
  categoryId?: string | null;
  constituencyId?: string | null;
}): Promise<string | null> {
  if (input.constituencyId) {
    const ac = await prisma.constituency.findUnique({
      where: { id: input.constituencyId },
      select: { districtId: true, desk: { select: { id: true } } },
    });
    if (ac?.desk?.id) return ac.desk.id;
    if (ac?.districtId) {
      const districtDesk = await prisma.desk.findFirst({
        where: { districtId: ac.districtId },
        select: { id: true },
      });
      if (districtDesk) return districtDesk.id;
    }
  }
  if (input.categoryId) {
    const topical = await prisma.desk.findFirst({
      where: { categoryId: input.categoryId },
      select: { id: true },
    });
    if (topical) return topical.id;
  }
  const root = await prisma.desk.findUnique({ where: { slug: "desk-rayalaseema-news" }, select: { id: true } });
  return root?.id ?? null;
}

async function main() {
  const articles = await prisma.content.findMany({
    where: { type: "ARTICLE", deskId: null },
    select: { id: true, categoryId: true, constituencyId: true },
  });
  console.log(`Content missing deskId: ${articles.length}`);
  if (articles.length === 0) return;

  let updated = 0;
  for (const a of articles) {
    const deskId = await resolveDeskId({ categoryId: a.categoryId, constituencyId: a.constituencyId });
    if (!deskId) continue;
    await prisma.content.update({ where: { id: a.id }, data: { deskId } });
    updated++;
  }
  console.log(`Backfilled ${updated}/${articles.length} content rows`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
