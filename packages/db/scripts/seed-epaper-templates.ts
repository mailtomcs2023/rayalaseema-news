// Seed 31 e-paper templates (broadsheet edition):
//   1  FRONT
//   8  DISTRICT (per Rayalaseema district)
//   2  STATE   (Andhra Pradesh, Telangana)
//   2  WORLD   (National, International)
//  12  TOPICAL SECTIONS (Politics, Business, Sports, Cinema, Movie Reviews,
//                       Editorial, Vasundhara, Hai Bujji, Sunday Magazine,
//                       Education, Health, Jobs)
//   3  UTILITY (Mandi/markets, Panchangam/horoscope, Weather)
//   1  CLASSIFIEDS + Real Estate
//   2  MISC   (Obituaries/Cartoons)
//
// Layout uses a 12-column × N-row grid. Row height ≈ 92px on a 1480×2760
// broadsheet canvas. Each template targets 14-20 articles per page.
//
// Idempotent - upserts by slug.

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
  slotFilter?: {
    categorySlug?: string;
    districtSlug?: string;
    minImages?: number;
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

// =========== FRONT PAGE ===========
// 12 cols × 30 rows - fits the Indian broadsheet printable area exactly
// (30 rows × 92 px = 2760 px = PDF page height). Anything past row 30 gets
// clipped by Playwright page.pdf, so the front page is tuned to land here.
//
// Story slots: 1 lead, 2 majors, 4 secondaries, 6 briefs (was 8 - trimmed
// to fit). minWords filter removed from lead so editorial-light days still
// fill the lead - score function still favors breaking+featured+image.
const frontPage: TemplateSpec = {
  slug: "front",
  name: "Front Page",
  type: "FRONT",
  defaultLabel: "ముఖ్యాంశాలు",
  sortOrder: 1,
  layout: {
    blocks: [
      // Masthead block lives in the FRONT page (grid-v1). v2 master is a
      // mm-v2-only feature that's gated off in render-layout, so v1 pages
      // need their own masthead block to render the Eenadu-style header.
      // Layout uses 30 rows total: masthead 4 + ad 2 + lead/majors 12 +
      // secondaries 5 + briefs 4 + ad 3 = 30. Fits the print page exactly.
      { id: "mh", type: "masthead", x: 0, y: 0, w: 12, h: 4 },
      { id: "ad-top", type: "ad", x: 0, y: 4, w: 12, h: 2 },
      // Lead - image preferred but not mandatory (so it always fills)
      { id: "lead", type: "lead", x: 0, y: 6, w: 8, h: 12, slotFilter: { minImages: 1 } },
      // Right column majors
      { id: "maj-1", type: "major", x: 8, y: 6, w: 4, h: 6, slotFilter: { minImages: 1 } },
      { id: "maj-2", type: "major", x: 8, y: 12, w: 4, h: 6, slotFilter: { minImages: 1 } },
      // Secondary band
      { id: "sec-1", type: "secondary", x: 0, y: 18, w: 3, h: 5 },
      { id: "sec-2", type: "secondary", x: 3, y: 18, w: 3, h: 5 },
      { id: "sec-3", type: "secondary", x: 6, y: 18, w: 3, h: 5 },
      { id: "sec-4", type: "secondary", x: 9, y: 18, w: 3, h: 5 },
      // Briefs - 2 cols × 2 rows
      { id: "br-1", type: "brief", x: 0, y: 23, w: 6, h: 2 },
      { id: "br-2", type: "brief", x: 0, y: 25, w: 6, h: 2 },
      { id: "br-3", type: "brief", x: 6, y: 23, w: 6, h: 2 },
      { id: "br-4", type: "brief", x: 6, y: 25, w: 6, h: 2 },
      // Bottom ad
      { id: "ad-bot", type: "ad", x: 0, y: 27, w: 12, h: 3 },
    ],
  },
};

// =========== DISTRICT PAGE ===========
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
        { id: "lead", type: "lead", x: 0, y: 2, w: 8, h: 11, slotFilter: { districtSlug: slug, minImages: 1 } },
        { id: "maj-1", type: "major", x: 8, y: 2, w: 4, h: 6, slotFilter: { districtSlug: slug, minImages: 1 } },
        { id: "maj-2", type: "major", x: 8, y: 8, w: 4, h: 5, slotFilter: { districtSlug: slug, minImages: 1 } },
        { id: "sec-1", type: "secondary", x: 0, y: 13, w: 3, h: 6, slotFilter: { districtSlug: slug } },
        { id: "sec-2", type: "secondary", x: 3, y: 13, w: 3, h: 6, slotFilter: { districtSlug: slug } },
        { id: "sec-3", type: "secondary", x: 6, y: 13, w: 3, h: 6, slotFilter: { districtSlug: slug } },
        { id: "sec-4", type: "secondary", x: 9, y: 13, w: 3, h: 6, slotFilter: { districtSlug: slug } },
        { id: "br-1", type: "brief", x: 0, y: 19, w: 6, h: 2, slotFilter: { districtSlug: slug } },
        { id: "br-2", type: "brief", x: 0, y: 21, w: 6, h: 2, slotFilter: { districtSlug: slug } },
        { id: "br-3", type: "brief", x: 0, y: 23, w: 6, h: 2, slotFilter: { districtSlug: slug } },
        { id: "br-4", type: "brief", x: 0, y: 25, w: 6, h: 2, slotFilter: { districtSlug: slug } },
        { id: "br-5", type: "brief", x: 6, y: 19, w: 6, h: 2, slotFilter: { districtSlug: slug } },
        { id: "br-6", type: "brief", x: 6, y: 21, w: 6, h: 2, slotFilter: { districtSlug: slug } },
        { id: "br-7", type: "brief", x: 6, y: 23, w: 6, h: 2, slotFilter: { districtSlug: slug } },
        { id: "br-8", type: "brief", x: 6, y: 25, w: 6, h: 2, slotFilter: { districtSlug: slug } },
        { id: "ad", type: "ad", x: 0, y: 27, w: 12, h: 3 },
      ],
    },
  };
}

// =========== REUSABLE STANDARD SECTION ===========
// Generic dense section page. Used for state, world, topical, utility pages.
function sectionPage(
  slug: string,
  nameSlug: string | null,            // category filter - null = no filter
  name: string,
  label: string,
  sortOrder: number,
  opts: { districtSlug?: string } = {},
): TemplateSpec {
  const filter = (extra: Record<string, unknown> = {}) => {
    const f: Record<string, unknown> = { ...extra };
    if (nameSlug) f.categorySlug = nameSlug;
    if (opts.districtSlug) f.districtSlug = opts.districtSlug;
    return Object.keys(f).length === 0 ? undefined : f;
  };
  const fillRules: Record<string, unknown> = {};
  if (nameSlug) fillRules.categorySlug = nameSlug;
  if (opts.districtSlug) fillRules.districtSlug = opts.districtSlug;

  return {
    slug,
    name,
    type: "SECTION",
    defaultLabel: label,
    fillRules: Object.keys(fillRules).length ? fillRules : undefined,
    sortOrder,
    layout: {
      blocks: [
        { id: "band", type: "section-band", x: 0, y: 0, w: 12, h: 2 },
        { id: "lead", type: "lead", x: 0, y: 2, w: 8, h: 11, slotFilter: filter({ minImages: 1 }) },
        { id: "maj-1", type: "major", x: 8, y: 2, w: 4, h: 6, slotFilter: filter({ minImages: 1 }) },
        { id: "maj-2", type: "major", x: 8, y: 8, w: 4, h: 5, slotFilter: filter() },
        { id: "sec-1", type: "secondary", x: 0, y: 13, w: 3, h: 6, slotFilter: filter() },
        { id: "sec-2", type: "secondary", x: 3, y: 13, w: 3, h: 6, slotFilter: filter() },
        { id: "sec-3", type: "secondary", x: 6, y: 13, w: 3, h: 6, slotFilter: filter() },
        { id: "sec-4", type: "secondary", x: 9, y: 13, w: 3, h: 6, slotFilter: filter() },
        { id: "br-1", type: "brief", x: 0, y: 19, w: 6, h: 2, slotFilter: filter() },
        { id: "br-2", type: "brief", x: 0, y: 21, w: 6, h: 2, slotFilter: filter() },
        { id: "br-3", type: "brief", x: 0, y: 23, w: 6, h: 2, slotFilter: filter() },
        { id: "br-4", type: "brief", x: 0, y: 25, w: 6, h: 2, slotFilter: filter() },
        { id: "br-5", type: "brief", x: 6, y: 19, w: 6, h: 2, slotFilter: filter() },
        { id: "br-6", type: "brief", x: 6, y: 21, w: 6, h: 2, slotFilter: filter() },
        { id: "br-7", type: "brief", x: 6, y: 23, w: 6, h: 2, slotFilter: filter() },
        { id: "br-8", type: "brief", x: 6, y: 25, w: 6, h: 2, slotFilter: filter() },
        { id: "ad", type: "ad", x: 0, y: 27, w: 12, h: 3 },
      ],
    },
  };
}

// =========== SPECIALIZED ===========

const editorialPage: TemplateSpec = {
  slug: "section-editorial",
  name: "Editorial Section",
  type: "SECTION",
  defaultLabel: "సంపాదకీయం",
  fillRules: { categorySlug: "editorial" },
  sortOrder: 70,
  layout: {
    blocks: [
      { id: "band", type: "section-band", x: 0, y: 0, w: 12, h: 2 },
      { id: "lead", type: "lead", x: 0, y: 2, w: 8, h: 16, slotFilter: { categorySlug: "editorial", minWords: 200 } },
      { id: "opinion-1", type: "major", x: 8, y: 2, w: 4, h: 8, slotFilter: { categorySlug: "editorial" } },
      { id: "opinion-2", type: "major", x: 8, y: 10, w: 4, h: 8, slotFilter: { categorySlug: "editorial" } },
      { id: "letters", type: "brief", x: 0, y: 18, w: 6, h: 2, slotFilter: { categorySlug: "reader-letters" } },
      { id: "letters-2", type: "brief", x: 0, y: 20, w: 6, h: 2, slotFilter: { categorySlug: "reader-letters" } },
      { id: "letters-3", type: "brief", x: 0, y: 22, w: 6, h: 2, slotFilter: { categorySlug: "reader-letters" } },
      { id: "letters-4", type: "brief", x: 0, y: 24, w: 6, h: 2, slotFilter: { categorySlug: "reader-letters" } },
      { id: "cartoon", type: "image", x: 6, y: 18, w: 6, h: 8 },
      { id: "ad", type: "ad", x: 0, y: 26, w: 12, h: 4 },
    ],
  },
};

// One page combines the three small utility widgets that don't deserve full
// pages of their own. Each gets its own band + quarter-page block.
const utilityPage: TemplateSpec = {
  slug: "section-utility",
  name: "Mandi · Panchangam · Weather",
  type: "SECTION",
  defaultLabel: "ఉపయోగకరం",
  sortOrder: 90,
  layout: {
    blocks: [
      { id: "band", type: "section-band", x: 0, y: 0, w: 12, h: 2 },
      // Mandi top-left
      { id: "mandi-band", type: "text", x: 0, y: 2, w: 6, h: 1, text: "<b>మండీ ధరలు</b>" },
      { id: "mandi-1", type: "brief", x: 0, y: 3, w: 6, h: 2 },
      { id: "mandi-2", type: "brief", x: 0, y: 5, w: 6, h: 2 },
      { id: "mandi-3", type: "brief", x: 0, y: 7, w: 6, h: 2 },
      // Panchangam top-right
      { id: "panch-band", type: "text", x: 6, y: 2, w: 6, h: 1, text: "<b>పంచాంగం · రాశి ఫలాలు</b>" },
      { id: "panch-1", type: "brief", x: 6, y: 3, w: 6, h: 2, slotFilter: { categorySlug: "rasi-phalalu" } },
      { id: "panch-2", type: "brief", x: 6, y: 5, w: 6, h: 2, slotFilter: { categorySlug: "rasi-phalalu" } },
      { id: "panch-3", type: "brief", x: 6, y: 7, w: 6, h: 2, slotFilter: { categorySlug: "rasi-phalalu" } },
      // Weather mid-page
      { id: "weather-band", type: "text", x: 0, y: 9, w: 12, h: 1, text: "<b>వాతావరణం</b>" },
      { id: "weather-1", type: "secondary", x: 0, y: 10, w: 3, h: 5, slotFilter: { categorySlug: "weather" } },
      { id: "weather-2", type: "secondary", x: 3, y: 10, w: 3, h: 5, slotFilter: { categorySlug: "weather" } },
      { id: "weather-3", type: "secondary", x: 6, y: 10, w: 3, h: 5, slotFilter: { categorySlug: "weather" } },
      { id: "weather-4", type: "secondary", x: 9, y: 10, w: 3, h: 5, slotFilter: { categorySlug: "weather" } },
      // Briefs filler
      { id: "br-1", type: "brief", x: 0, y: 15, w: 6, h: 2 },
      { id: "br-2", type: "brief", x: 0, y: 17, w: 6, h: 2 },
      { id: "br-3", type: "brief", x: 0, y: 19, w: 6, h: 2 },
      { id: "br-4", type: "brief", x: 0, y: 21, w: 6, h: 2 },
      { id: "br-5", type: "brief", x: 6, y: 15, w: 6, h: 2 },
      { id: "br-6", type: "brief", x: 6, y: 17, w: 6, h: 2 },
      { id: "br-7", type: "brief", x: 6, y: 19, w: 6, h: 2 },
      { id: "br-8", type: "brief", x: 6, y: 21, w: 6, h: 2 },
      { id: "ad", type: "ad", x: 0, y: 23, w: 12, h: 4 },
    ],
  },
};

const classifiedsPage: TemplateSpec = {
  slug: "section-classifieds",
  name: "Classifieds + Real Estate",
  type: "SECTION",
  defaultLabel: "క్లాసిఫైడ్స్",
  sortOrder: 80,
  layout: {
    blocks: [
      { id: "band", type: "section-band", x: 0, y: 0, w: 12, h: 2 },
      { id: "ad-1", type: "ad", x: 0, y: 2, w: 4, h: 9 },
      { id: "ad-2", type: "ad", x: 4, y: 2, w: 4, h: 9 },
      { id: "ad-3", type: "ad", x: 8, y: 2, w: 4, h: 9 },
      { id: "ad-4", type: "ad", x: 0, y: 11, w: 6, h: 8 },
      { id: "ad-5", type: "ad", x: 6, y: 11, w: 6, h: 8 },
      { id: "jobs-1", type: "brief", x: 0, y: 19, w: 6, h: 2, slotFilter: { categorySlug: "jobs" } },
      { id: "jobs-2", type: "brief", x: 0, y: 21, w: 6, h: 2, slotFilter: { categorySlug: "jobs" } },
      { id: "jobs-3", type: "brief", x: 0, y: 23, w: 6, h: 2, slotFilter: { categorySlug: "jobs" } },
      { id: "re-1", type: "brief", x: 6, y: 19, w: 6, h: 2, slotFilter: { categorySlug: "real-estate" } },
      { id: "re-2", type: "brief", x: 6, y: 21, w: 6, h: 2, slotFilter: { categorySlug: "real-estate" } },
      { id: "re-3", type: "brief", x: 6, y: 23, w: 6, h: 2, slotFilter: { categorySlug: "real-estate" } },
      { id: "ad-6", type: "ad", x: 0, y: 25, w: 12, h: 5 },
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

// Section templates routed through categories. Restructured to lead with our
// brand-unique sections (Navyaseema, Rayalaseema Ruchulu, Yetteta, NRI,
// Puzzles) instead of mimicking Eenadu/Sakshi tab-for-tab. Standalone
// Mandi/Panchangam/Weather were dropped - they're quarter-page widgets and
// belong inside the Utility page, not their own broadsheet pages.
//
// `seed.ts` ensures every referenced category is upserted on deploy.
const SECTIONS: Array<{ slug: string; cat: string | null; name: string; label: string; sortOrder: number }> = [
  // ===== BRAND-UNIQUE (the reasons readers pick us over Eenadu/Sakshi) =====
  { slug: "section-navyaseema",       cat: "navyaseema",       name: "Navyaseema",        label: "నవ్యసీమ",            sortOrder: 40 },
  { slug: "section-rayalaseema-ruchulu", cat: "rayalaseema-ruchulu", name: "Rayalaseema Ruchulu (Recipes)", label: "రాయలసీమ రుచులు", sortOrder: 41 },
  { slug: "section-yetteta",          cat: "yetteta",          name: "Yetteta (Humor)",   label: "ఎట్టెట",             sortOrder: 42 },
  { slug: "section-nri",              cat: "nri",              name: "NRI News",          label: "NRI వార్తలు",        sortOrder: 43 },
  { slug: "section-puzzles",          cat: "puzzles",          name: "Puzzles",           label: "పజిల్స్",             sortOrder: 44 },

  // ===== STATE & WORLD =====
  { slug: "section-andhra-pradesh",   cat: "andhra-pradesh",   name: "Andhra Pradesh",    label: "ఆంధ్రప్రదేశ్",         sortOrder: 50 },
  { slug: "section-telangana",        cat: "telangana",        name: "Telangana",         label: "తెలంగాణ",             sortOrder: 51 },
  { slug: "section-national",         cat: "national",         name: "National",          label: "జాతీయం",              sortOrder: 52 },
  { slug: "section-international",    cat: "international",    name: "International",     label: "అంతర్జాతీయం",        sortOrder: 53 },

  // ===== TOPICAL =====
  { slug: "section-politics",         cat: "politics",         name: "Politics",          label: "రాజకీయాలు",          sortOrder: 60 },
  { slug: "section-business",         cat: "business",         name: "Business",          label: "బిజినెస్",             sortOrder: 61 },
  { slug: "section-sports",           cat: "sports",           name: "Sports",            label: "క్రీడలు",             sortOrder: 62 },
  { slug: "section-cinema",           cat: "entertainment",    name: "Cinema",            label: "సినిమా",              sortOrder: 63 },
  { slug: "section-movie-reviews",    cat: "movie-reviews",    name: "Movie Reviews",     label: "సినిమా రివ్యూలు",     sortOrder: 64 },
  { slug: "section-technology",       cat: "technology",       name: "Technology",        label: "టెక్నాలజీ",          sortOrder: 65 },
  { slug: "section-education",        cat: "education",        name: "Education",         label: "విద్య",                sortOrder: 66 },
  { slug: "section-health",           cat: "health",           name: "Health",            label: "ఆరోగ్యం",             sortOrder: 67 },
  { slug: "section-jobs",             cat: "jobs",             name: "Jobs",              label: "ఉద్యోగాలు",           sortOrder: 68 },

  // ===== LIFESTYLE =====
  { slug: "section-vasundhara",       cat: "vasundhara",       name: "Vasundhara (Women & Family)", label: "వసుంధర",   sortOrder: 100 },
  { slug: "section-hai-bujji",        cat: "hai-bujji",        name: "Hai Bujji (Kids)",  label: "హాయ్ బుజ్జి",         sortOrder: 101 },
  { slug: "section-sunday-magazine",  cat: "sunday-magazine",  name: "Sunday Magazine",   label: "ఆదివారం మాగజైన్",    sortOrder: 102 },
  { slug: "section-obituaries",       cat: "obituaries",       name: "Obituaries & Birthdays", label: "శ్రద్ధాంజలి",   sortOrder: 103 },
];

async function main() {
  const all: TemplateSpec[] = [
    frontPage,
    ...DISTRICTS.map((d, i) => districtPage(d.slug, d.nameTe, 10 + i)),
    ...SECTIONS.map((s) => sectionPage(s.slug, s.cat, s.name, s.label, s.sortOrder)),
    editorialPage,
    utilityPage,
    classifiedsPage,
  ];

  // Deactivate any standalone-utility templates from the prior structure so the
  // combined Utility page replaces them.
  await prisma.epaperTemplate.updateMany({
    where: { slug: { in: ["section-mandi", "section-panchangam", "section-weather"] } },
    data: { active: false },
  });

  let upserted = 0;
  for (const t of all) {
    await prisma.epaperTemplate.upsert({
      where: { slug: t.slug },
      update: {
        name: t.name, type: t.type, defaultLabel: t.defaultLabel,
        fillRules: (t.fillRules ?? null) as any,
        layout: t.layout as any,
        sortOrder: t.sortOrder, active: true,
      },
      create: {
        slug: t.slug, name: t.name, type: t.type, defaultLabel: t.defaultLabel,
        fillRules: (t.fillRules ?? null) as any,
        layout: t.layout as any,
        sortOrder: t.sortOrder, active: true,
      },
    });
    upserted++;
  }
  const counts = await prisma.epaperTemplate.groupBy({ by: ["type"], _count: true });
  console.log(`Templates upserted: ${upserted}`);
  for (const c of counts) console.log(`  ${c.type.padEnd(8)} ${c._count}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
