// Seed Desk table (idempotent, upserts by slug):
//   - 1 root GEOGRAPHIC desk (Rayalaseema News)
//   - 1 per district (8) under root
//   - 1 per constituency (55) under matching district
//   - 1 TOPICAL per active root category (~21 — skip "editorial", handled by EDITORIAL branch)
//   - 3 EDITORIAL: Editorial / Opinion / Letters
//
// Run:  cd packages/db && bunx tsx scripts/seed-desks.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ROOT_SLUG = "desk-rayalaseema-news";
const ROOT_NAME_TE = "రాయలసీమ న్యూస్";
const ROOT_NAME_EN = "Rayalaseema News";

async function main() {
  // 1. Root GEOGRAPHIC desk
  const root = await prisma.desk.upsert({
    where: { slug: ROOT_SLUG },
    update: { name: ROOT_NAME_TE, nameEn: ROOT_NAME_EN },
    create: {
      slug: ROOT_SLUG,
      name: ROOT_NAME_TE,
      nameEn: ROOT_NAME_EN,
      branch: "GEOGRAPHIC",
      sortOrder: 0,
    },
  });
  console.log(`root: ${root.nameEn}`);

  // 2. District desks (child of root). Byline prefixed with the brand:
  //    "రాయలసీమ న్యూస్ - కర్నూలు" / "Rayalaseema News - Kurnool"
  const districts = await prisma.district.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, nameEn: true, slug: true },
  });
  let dCount = 0;
  for (const d of districts) {
    const teName = `${ROOT_NAME_TE} - ${d.name}`;
    const enName = `${ROOT_NAME_EN} - ${d.nameEn}`;
    await prisma.desk.upsert({
      where: { slug: `desk-district-${d.slug}` },
      update: { name: teName, nameEn: enName, parentId: root.id, districtId: d.id, branch: "GEOGRAPHIC" },
      create: {
        slug: `desk-district-${d.slug}`,
        name: teName,
        nameEn: enName,
        branch: "GEOGRAPHIC",
        parentId: root.id,
        districtId: d.id,
        sortOrder: dCount,
      },
    });
    dCount++;
  }
  console.log(`district desks: ${dCount}`);

  // 3. AC desks (child of their district desk). Byline prefixed with the brand:
  //    "రాయలసీమ న్యూస్ - ప్రొద్దుటూరు" / "Rayalaseema News - Proddatur"
  const acs = await prisma.constituency.findMany({
    where: { acNumber: { not: null } },
    orderBy: { acNumber: "asc" },
    select: { id: true, name: true, nameEn: true, acNumber: true, districtId: true },
  });
  let acCount = 0;
  for (const ac of acs) {
    const districtDesk = await prisma.desk.findFirst({
      where: { districtId: ac.districtId, branch: "GEOGRAPHIC" },
      select: { id: true },
    });
    const teName = `${ROOT_NAME_TE} - ${ac.name}`;
    const enName = `${ROOT_NAME_EN} - ${ac.nameEn}`;
    await prisma.desk.upsert({
      where: { slug: `desk-ac-${ac.acNumber}` },
      update: {
        name: teName,
        nameEn: enName,
        parentId: districtDesk?.id ?? root.id,
        constituencyId: ac.id,
        branch: "GEOGRAPHIC",
      },
      create: {
        slug: `desk-ac-${ac.acNumber}`,
        name: teName,
        nameEn: enName,
        branch: "GEOGRAPHIC",
        parentId: districtDesk?.id ?? root.id,
        constituencyId: ac.id,
        sortOrder: ac.acNumber!,
      },
    });
    acCount++;
  }
  console.log(`AC desks: ${acCount}`);

  // 4. TOPICAL desks (one per category, except `editorial` which is in EDITORIAL branch).
  //
  // Naming rule (per user): desk byline uses the ENGLISH word transliterated into
  // Telugu script (e.g. "పొలిటికల్", "స్పోర్ట్స్"), NOT the Telugu translation that the
  // category nameField uses (e.g. "రాజకీయాలు", "క్రీడలు"). Categories stay as-is.
  //
  // Format: "<root-te> <transliterated-en-te> డెస్క్" → "రాయలసీమ న్యూస్ పొలిటికల్ డెస్క్"
  const TOPICAL_BYLINE: Record<string, string> = {
    politics: "పొలిటికల్",
    crime: "క్రైమ్",
    sports: "స్పోర్ట్స్",
    business: "బిజినెస్",
    entertainment: "ఎంటర్‌టైన్‌మెంట్",
    education: "ఎడ్యుకేషన్",
    agriculture: "అగ్రికల్చర్",
    "district-news": "డిస్ట్రిక్ట్ న్యూస్",
    national: "నేషనల్",
    international: "ఇంటర్నేషనల్",
    technology: "టెక్నాలజీ",
    health: "హెల్త్",
    devotional: "డివోషనల్",
    "rasi-phalalu": "హరోస్కోప్",
    jobs: "జాబ్స్",
    "movie-reviews": "మూవీ రివ్యూస్",
    "exam-results": "ఎగ్జామ్ రిజల్ట్స్",
    weather: "వెదర్",
    nri: "NRI",
    navyaseema: "నవ్యసీమ", // regional brand-name, keep as-is
    "real-estate": "రియల్ ఎస్టేట్",
  };

  const categories = await prisma.category.findMany({
    where: { active: true, parentId: null, slug: { not: "editorial" } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, nameEn: true, slug: true },
  });
  let tCount = 0;
  for (const c of categories) {
    // Fallback to the Telugu category name if we don't have an explicit transliteration mapped yet.
    const topicTe = TOPICAL_BYLINE[c.slug] ?? c.name;
    const teName = `${ROOT_NAME_TE} ${topicTe} డెస్క్`;
    const enName = `${ROOT_NAME_EN} ${c.nameEn ?? c.name} Desk`;
    await prisma.desk.upsert({
      where: { slug: `desk-cat-${c.slug}` },
      update: { name: teName, nameEn: enName, categoryId: c.id, branch: "TOPICAL" },
      create: {
        slug: `desk-cat-${c.slug}`,
        name: teName,
        nameEn: enName,
        branch: "TOPICAL",
        categoryId: c.id,
        sortOrder: tCount,
      },
    });
    tCount++;
  }
  console.log(`topical desks: ${tCount}`);

  // 5. EDITORIAL branch (manual desks for opinion writing).
  const editorial = [
    { slug: "desk-editorial", te: `${ROOT_NAME_TE} ఎడిటోరియల్ డెస్క్`, en: `${ROOT_NAME_EN} Editorial Desk` },
    { slug: "desk-opinion", te: `${ROOT_NAME_TE} ఒపీనియన్ డెస్క్`, en: `${ROOT_NAME_EN} Opinion Desk` },
    { slug: "desk-letters", te: `${ROOT_NAME_TE} లెటర్స్ డెస్క్`, en: `${ROOT_NAME_EN} Letters Desk` },
  ];
  let eCount = 0;
  for (const e of editorial) {
    await prisma.desk.upsert({
      where: { slug: e.slug },
      update: { name: e.te, nameEn: e.en, branch: "EDITORIAL" },
      create: { slug: e.slug, name: e.te, nameEn: e.en, branch: "EDITORIAL", sortOrder: eCount },
    });
    eCount++;
  }
  // Wire the `editorial` category's TOPICAL link to the EDITORIAL "Editorial Desk".
  const editorialCat = await prisma.category.findUnique({ where: { slug: "editorial" }, select: { id: true } });
  if (editorialCat) {
    await prisma.desk.update({
      where: { slug: "desk-editorial" },
      data: { categoryId: editorialCat.id },
    });
  }
  console.log(`editorial desks: ${eCount}`);

  const total = await prisma.desk.count();
  console.log(`total desks in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
