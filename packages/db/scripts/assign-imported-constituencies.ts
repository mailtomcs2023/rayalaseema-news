// LOCAL DEV ONLY: scatter constituency-less ARTICLE rows (e.g. ones brought
// in by import-articles-from-api.ts) across local districts/constituencies,
// so the homepage district grid + /district/* + /constituency/* pages have
// content. Round-robins by DISTRICT so each district cell gets a fair share.
// Idempotent: only touches articles whose constituencyId is still null.

import { prisma } from "../src/index";

async function main() {
  const consts = await prisma.constituency.findMany({
    select: { id: true, districtId: true },
  });
  if (consts.length === 0) {
    console.log("No constituencies found - run rebuild-constituencies.ts first.");
    return;
  }

  const byDistrict = new Map<string, string[]>();
  for (const c of consts) {
    if (!c.districtId) continue;
    if (!byDistrict.has(c.districtId)) byDistrict.set(c.districtId, []);
    byDistrict.get(c.districtId)!.push(c.id);
  }
  const districtIds = [...byDistrict.keys()];
  if (districtIds.length === 0) {
    console.log("Constituencies have no district links - cannot assign.");
    return;
  }

  const arts = await prisma.content.findMany({
    where: { type: "ARTICLE", constituencyId: null },
    select: { id: true },
    orderBy: { publishedAt: "desc" },
  });

  let i = 0;
  for (const a of arts) {
    const dId = districtIds[i % districtIds.length];
    const consInDist = byDistrict.get(dId)!;
    const cId = consInDist[Math.floor(i / districtIds.length) % consInDist.length];
    await prisma.content.update({ where: { id: a.id }, data: { constituencyId: cId } });
    i++;
  }

  console.log(`Assigned ${arts.length} article(s) across ${districtIds.length} district(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
