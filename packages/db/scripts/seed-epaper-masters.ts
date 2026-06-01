// Seed v2 master pages (#144).
//
// front-master    masthead + cities band + folio   used by FRONT template
// district-master section-band + folio              used by DISTRICT templates
// section-master  section-band + folio              used by SECTION templates
//
// All coords in mm against the 330×520 mm live area. Idempotent - upserts by slug.
// Run: bun packages/db/scripts/seed-epaper-masters.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface MasterBlock {
  id: string;
  type: string;
  x: number; y: number; w: number; h: number;
  isMaster: true;
  content?: string;
  slots?: Array<{ name: string; x: number; y: number; w: number; h: number }>;
}

// Front master: masthead occupies top ~85mm with ad slots flanking the logo +
// bibliographic info row + cities band; folio at bottom edge.
const frontMaster: { slug: string; name: string; layout: { coordSystem: "mm-v2"; blocks: MasterBlock[] } } = {
  slug: "front-master",
  name: "Front Page Master",
  layout: {
    coordSystem: "mm-v2",
    blocks: [
      {
        id: "front-masthead", type: "masthead",
        x: 0, y: 0, w: 330, h: 85, isMaster: true,
        slots: [
          { name: "ad-left",  x: 0,   y: 0,  w: 60, h: 60 },
          { name: "ad-right", x: 270, y: 0,  w: 60, h: 60 },
        ],
      },
      {
        id: "front-folio", type: "folio",
        x: 0, y: 510, w: 330, h: 10, isMaster: true,
        content: "{{pageNumber}} · {{dateLabel}} · www.rayalaseemanews.com",
      },
    ],
  },
};

const districtMaster: { slug: string; name: string; layout: { coordSystem: "mm-v2"; blocks: MasterBlock[] } } = {
  slug: "district-master",
  name: "District Page Master",
  layout: {
    coordSystem: "mm-v2",
    blocks: [
      {
        id: "district-band", type: "section-band",
        x: 0, y: 0, w: 330, h: 18, isMaster: true,
        content: "{{sectionLabel}}",
      },
      {
        id: "district-folio", type: "folio",
        x: 0, y: 510, w: 330, h: 10, isMaster: true,
        content: "Page {{pageNumber}} · {{dateLabel}}",
      },
    ],
  },
};

const sectionMaster: { slug: string; name: string; layout: { coordSystem: "mm-v2"; blocks: MasterBlock[] } } = {
  slug: "section-master",
  name: "Section Page Master",
  layout: {
    coordSystem: "mm-v2",
    blocks: [
      {
        id: "section-band", type: "section-band",
        x: 0, y: 0, w: 330, h: 16, isMaster: true,
        content: "{{sectionLabel}}",
      },
      {
        id: "section-folio", type: "folio",
        x: 0, y: 510, w: 330, h: 10, isMaster: true,
        content: "Page {{pageNumber}} · {{dateLabel}}",
      },
    ],
  },
};

async function upsertMaster(m: { slug: string; name: string; layout: object }) {
  await prisma.epaperMaster.upsert({
    where: { slug: m.slug },
    update: { name: m.name, layout: m.layout as any },
    create: { slug: m.slug, name: m.name, layout: m.layout as any },
  });
  console.log(`  ✓ ${m.slug}`);
}

async function linkTemplatesToMasters() {
  const updates = [
    { type: "FRONT" as const, master: "front-master" },
    { type: "DISTRICT" as const, master: "district-master" },
    { type: "SECTION" as const, master: "section-master" },
  ];
  for (const u of updates) {
    const r = await prisma.epaperTemplate.updateMany({
      where: { type: u.type },
      data: { masterSlug: u.master },
    });
    console.log(`  ↳ linked ${r.count} ${u.type} template(s) → ${u.master}`);
  }
}

async function main() {
  console.log("Seeding ePaper masters (#108)…");
  await upsertMaster(frontMaster);
  await upsertMaster(districtMaster);
  await upsertMaster(sectionMaster);
  console.log("Linking templates → masters…");
  await linkTemplatesToMasters();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
