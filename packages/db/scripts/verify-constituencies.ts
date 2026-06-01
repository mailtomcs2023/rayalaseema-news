// Sanity check after rebuild.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Spec #1 A1C (#189) - `articles` back-relation on Constituency removed
  // when Article was dropped. Replace with Content count via a separate
  // groupBy below.
  const acs = await prisma.constituency.findMany({
    include: {
      district: { select: { slug: true } },
      _count: { select: { mandals: true } },
    },
    orderBy: { acNumber: "asc" },
  });
  const contentByConst = await prisma.content.groupBy({
    by: ["constituencyId"],
    where: { type: "ARTICLE", constituencyId: { not: null } },
    _count: { _all: true },
  });
  const articlesByConstId: Record<string, number> = {};
  for (const c of contentByConst) {
    if (c.constituencyId) articlesByConstId[c.constituencyId] = c._count._all;
  }

  console.log(`Total ACs: ${acs.length}`);
  console.log(`AC#  District          Slug                                Mandals  Articles  TeluguName`);
  console.log("─".repeat(110));
  let totalMandals = 0, totalArticles = 0;
  for (const a of acs) {
    const artCount = articlesByConstId[a.id] || 0;
    totalMandals += a._count.mandals;
    totalArticles += artCount;
    console.log(
      `${a.acNumber!.toString().padStart(3)}  ${a.district.slug.padEnd(16)} ${a.slug.padEnd(36)} ${a._count.mandals.toString().padStart(6)}  ${artCount.toString().padStart(7)}  ${a.name}`
    );
  }
  console.log("─".repeat(110));
  console.log(`Totals: ${totalMandals} mandals, ${totalArticles} articles across ${acs.length} ACs`);

  // Check for orphan mandals or articles (FK should prevent this but verify)
  const allMandals = await prisma.mandal.count();
  const allArticles = await prisma.content.count({ where: { type: "ARTICLE" } });
  const articlesWithConst = await prisma.content.count({ where: { type: "ARTICLE", constituencyId: { not: null } } });
  console.log(`\nMandals total in DB: ${allMandals} (all should be attached to one of the 55 ACs)`);
  console.log(`Articles total: ${allArticles}, with constituency: ${articlesWithConst}`);

  // District distribution
  const byDistrict = await prisma.constituency.groupBy({
    by: ["districtId"],
    _count: true,
  });
  const districts = await prisma.district.findMany({ select: { id: true, slug: true } });
  const dMap = new Map(districts.map(d => [d.id, d.slug]));
  console.log("\nPer-district AC count:");
  for (const g of byDistrict) {
    console.log(`  ${dMap.get(g.districtId)!.padEnd(16)} ${g._count}`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
