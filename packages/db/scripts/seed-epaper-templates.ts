// Seed 13 default e-paper templates:
//   - 1 FRONT
//   - 8 DISTRICT (one per Rayalaseema district)
//   - 4 SECTION (sports, cinema, editorial, classifieds)
//
// Layout uses a 12-column × N-row grid. Each block's {x,y,w,h} is in grid units.
//
// Idempotent — upserts by slug.
//
// Run:  cd packages/db && bunx tsx scripts/seed-epaper-templates.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type BlockType =
  | "masthead"
  | "section-band"
  | "lead"
  | "major"
  | "secondary"
  | "brief"
  | "image"
  | "ad"
  | "text"
  | "story-jump";

interface Block {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  // Optional metadata the auto-fill engine + renderer read
  slotFilter?: {
    categorySlug?: string;
    districtSlug?: string;
    minImages?: number;     // 1 = require featuredImage
    minWords?: number;
    maxWords?: number;
    breaking?: boolean;
  };
  text?: string;
}

interface TemplateSpec {
  slug: string;
  name: string;
  type: "FRONT" | "DISTRICT" | "SECTION" | "BACK";
  defaultLabel?: string;
  fillRules?: Record<string, unknown>;
  layout: { blocks: Block[] };
  sortOrder: number;
}

// 12-col × 28-row broadsheet (≈ 1200×2000 px when each cell is 100×72 px).

const frontPage: TemplateSpec = {
  slug: "front",
  name: "Front Page",
  type: "FRONT",
  defaultLabel: "ముఖ్యాంశాలు",
  sortOrder: 1,
  layout: {
    blocks: [
      { id: "mh", type: "masthead", x: 0, y: 0, w: 12, h: 3 },
      { id: "ad-top", type: "ad", x: 0, y: 3, w: 12, h: 2 },
      { id: "lead", type: "lead", x: 0, y: 5, w: 8, h: 12, slotFilter: { minImages: 1, minWords: 150 } },
      { id: "maj-1", type: "major", x: 8, y: 5, w: 4, h: 6, slotFilter: { minImages: 1 } },
      { id: "maj-2", type: "major", x: 8, y: 11, w: 4, h: 6, slotFilter: { minImages: 1 } },
      { id: "sec-1", type: "secondary", x: 0, y: 17, w: 4, h: 5, slotFilter: { minImages: 1 } },
      { id: "sec-2", type: "secondary", x: 4, y: 17, w: 4, h: 5, slotFilter: { minImages: 1 } },
      { id: "sec-3", type: "secondary", x: 8, y: 17, w: 4, h: 5, slotFilter: { minImages: 1 } },
      { id: "brief-col-1", type: "brief", x: 0, y: 22, w: 6, h: 4 },
      { id: "brief-col-2", type: "brief", x: 6, y: 22, w: 6, h: 4 },
      { id: "ad-bot", type: "ad", x: 0, y: 26, w: 12, h: 2 },
    ],
  },
};

function districtPage(slug: string, nameTe: string, sortOrder: number): TemplateSpec {
  return {
    slug: `district-${slug}`,
    name: `${nameTe} District Page`,
    type: "DISTRICT",
    defaultLabel: `${nameTe} వార్తలు`,
    fillRules: { districtSlug: slug },
    sortOrder,
    layout: {
      blocks: [
        { id: "band", type: "section-band", x: 0, y: 0, w: 12, h: 2 },
        { id: "lead", type: "lead", x: 0, y: 2, w: 8, h: 10, slotFilter: { districtSlug: slug, minImages: 1 } },
        { id: "maj-1", type: "major", x: 8, y: 2, w: 4, h: 5, slotFilter: { districtSlug: slug, minImages: 1 } },
        { id: "maj-2", type: "major", x: 8, y: 7, w: 4, h: 5, slotFilter: { districtSlug: slug, minImages: 1 } },
        { id: "sec-1", type: "secondary", x: 0, y: 12, w: 4, h: 5, slotFilter: { districtSlug: slug } },
        { id: "sec-2", type: "secondary", x: 4, y: 12, w: 4, h: 5, slotFilter: { districtSlug: slug } },
        { id: "sec-3", type: "secondary", x: 8, y: 12, w: 4, h: 5, slotFilter: { districtSlug: slug } },
        { id: "brief-col-1", type: "brief", x: 0, y: 17, w: 6, h: 7, slotFilter: { districtSlug: slug } },
        { id: "brief-col-2", type: "brief", x: 6, y: 17, w: 6, h: 7, slotFilter: { districtSlug: slug } },
        { id: "ad", type: "ad", x: 0, y: 24, w: 12, h: 2 },
      ],
    },
  };
}

const sportsPage: TemplateSpec = {
  slug: "section-sports",
  name: "Sports Section",
  type: "SECTION",
  defaultLabel: "క్రీడలు",
  fillRules: { categorySlug: "sports" },
  sortOrder: 50,
  layout: {
    blocks: [
      { id: "band", type: "section-band", x: 0, y: 0, w: 12, h: 2 },
      { id: "lead", type: "lead", x: 0, y: 2, w: 8, h: 10, slotFilter: { categorySlug: "sports", minImages: 1 } },
      { id: "maj-1", type: "major", x: 8, y: 2, w: 4, h: 5, slotFilter: { categorySlug: "sports", minImages: 1 } },
      { id: "maj-2", type: "major", x: 8, y: 7, w: 4, h: 5, slotFilter: { categorySlug: "sports" } },
      { id: "sec-1", type: "secondary", x: 0, y: 12, w: 4, h: 5, slotFilter: { categorySlug: "sports" } },
      { id: "sec-2", type: "secondary", x: 4, y: 12, w: 4, h: 5, slotFilter: { categorySlug: "sports" } },
      { id: "sec-3", type: "secondary", x: 8, y: 12, w: 4, h: 5, slotFilter: { categorySlug: "sports" } },
      { id: "briefs", type: "brief", x: 0, y: 17, w: 12, h: 7, slotFilter: { categorySlug: "sports" } },
      { id: "ad", type: "ad", x: 0, y: 24, w: 12, h: 2 },
    ],
  },
};

const cinemaPage: TemplateSpec = {
  slug: "section-cinema",
  name: "Cinema Section",
  type: "SECTION",
  defaultLabel: "సినిమా",
  fillRules: { categorySlug: "entertainment" },
  sortOrder: 51,
  layout: {
    blocks: [
      { id: "band", type: "section-band", x: 0, y: 0, w: 12, h: 2 },
      { id: "lead", type: "lead", x: 0, y: 2, w: 8, h: 10, slotFilter: { categorySlug: "entertainment", minImages: 1 } },
      { id: "review", type: "major", x: 8, y: 2, w: 4, h: 10, slotFilter: { categorySlug: "movie-reviews" } },
      { id: "sec-1", type: "secondary", x: 0, y: 12, w: 4, h: 5, slotFilter: { categorySlug: "entertainment" } },
      { id: "sec-2", type: "secondary", x: 4, y: 12, w: 4, h: 5, slotFilter: { categorySlug: "entertainment" } },
      { id: "sec-3", type: "secondary", x: 8, y: 12, w: 4, h: 5, slotFilter: { categorySlug: "movie-reviews" } },
      { id: "briefs", type: "brief", x: 0, y: 17, w: 12, h: 7, slotFilter: { categorySlug: "entertainment" } },
      { id: "ad", type: "ad", x: 0, y: 24, w: 12, h: 2 },
    ],
  },
};

const editorialPage: TemplateSpec = {
  slug: "section-editorial",
  name: "Editorial Section",
  type: "SECTION",
  defaultLabel: "సంపాదకీయం",
  fillRules: { categorySlug: "editorial" },
  sortOrder: 52,
  layout: {
    blocks: [
      { id: "band", type: "section-band", x: 0, y: 0, w: 12, h: 2 },
      { id: "lead", type: "lead", x: 0, y: 2, w: 8, h: 14, slotFilter: { categorySlug: "editorial", minWords: 200 } },
      { id: "opinion-1", type: "major", x: 8, y: 2, w: 4, h: 7, slotFilter: { categorySlug: "editorial" } },
      { id: "opinion-2", type: "major", x: 8, y: 9, w: 4, h: 7, slotFilter: { categorySlug: "editorial" } },
      { id: "letters", type: "brief", x: 0, y: 16, w: 6, h: 8, slotFilter: { categorySlug: "reader-letters" } },
      { id: "cartoon", type: "image", x: 6, y: 16, w: 6, h: 8 },
      { id: "ad", type: "ad", x: 0, y: 24, w: 12, h: 2 },
    ],
  },
};

const classifiedsPage: TemplateSpec = {
  slug: "section-classifieds",
  name: "Classifieds Section",
  type: "SECTION",
  defaultLabel: "క్లాసిఫైడ్స్",
  sortOrder: 53,
  layout: {
    blocks: [
      { id: "band", type: "section-band", x: 0, y: 0, w: 12, h: 2 },
      { id: "ad-1", type: "ad", x: 0, y: 2, w: 4, h: 8 },
      { id: "ad-2", type: "ad", x: 4, y: 2, w: 4, h: 8 },
      { id: "ad-3", type: "ad", x: 8, y: 2, w: 4, h: 8 },
      { id: "ad-4", type: "ad", x: 0, y: 10, w: 6, h: 8 },
      { id: "ad-5", type: "ad", x: 6, y: 10, w: 6, h: 8 },
      { id: "jobs", type: "brief", x: 0, y: 18, w: 6, h: 8, slotFilter: { categorySlug: "jobs" } },
      { id: "real-estate", type: "brief", x: 6, y: 18, w: 6, h: 8, slotFilter: { categorySlug: "real-estate" } },
    ],
  },
};

const DISTRICTS: Array<{ slug: string; nameTe: string }> = [
  { slug: "kurnool", nameTe: "కర్నూలు" },
  { slug: "nandyal", nameTe: "నంద్యాల" },
  { slug: "ananthapuramu", nameTe: "అనంతపురం" },
  { slug: "sri-sathya-sai", nameTe: "శ్రీ సత్యసాయి" },
  { slug: "ysr-kadapa", nameTe: "వై.యస్.ఆర్" },
  { slug: "annamayya", nameTe: "అన్నమయ్య" },
  { slug: "tirupati", nameTe: "తిరుపతి" },
  { slug: "chittoor", nameTe: "చిత్తూరు" },
];

async function main() {
  const all: TemplateSpec[] = [
    frontPage,
    ...DISTRICTS.map((d, i) => districtPage(d.slug, d.nameTe, 10 + i)),
    sportsPage,
    cinemaPage,
    editorialPage,
    classifiedsPage,
  ];

  let upserted = 0;
  for (const t of all) {
    await prisma.epaperTemplate.upsert({
      where: { slug: t.slug },
      update: {
        name: t.name,
        type: t.type,
        defaultLabel: t.defaultLabel,
        fillRules: t.fillRules as any,
        layout: t.layout as any,
        sortOrder: t.sortOrder,
        active: true,
      },
      create: {
        slug: t.slug,
        name: t.name,
        type: t.type,
        defaultLabel: t.defaultLabel,
        fillRules: t.fillRules as any,
        layout: t.layout as any,
        sortOrder: t.sortOrder,
        active: true,
      },
    });
    upserted++;
  }
  console.log(`Templates upserted: ${upserted}`);
  console.log(`  FRONT:    1`);
  console.log(`  DISTRICT: ${DISTRICTS.length}`);
  console.log(`  SECTION:  4 (sports, cinema, editorial, classifieds)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
