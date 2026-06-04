// Spec #3 E2 (#184) - seed HEADER / FOOTER / MOBILE menus with values that
// mirror the pre-Spec-3 hardcoded nav in apps/web/src/components/header.tsx
// + footer.tsx + mobile-menu.tsx. Idempotent: skips a location that already
// has rows so re-runs from deploy.yml don't overwrite admin edits.
import { prisma, MenuLocation } from "../src/index";

function id() {
  return "itm_" + Math.random().toString(36).slice(2, 11);
}

const HEADER_TOP_DISTRICTS = [
  { label: "కర్నూలు", slug: "kurnool" },
  { label: "నంద్యాల", slug: "nandyal" },
  { label: "అనంతపురం", slug: "ananthapuramu" },
  { label: "శ్రీ సత్యసాయి", slug: "sri-sathya-sai" },
  { label: "వై.యస్.ఆర్", slug: "ysr-kadapa" },
  { label: "తిరుపతి", slug: "tirupati" },
  { label: "అన్నమయ్య", slug: "annamayya" },
  { label: "చిత్తూరు", slug: "chittoor" },
];

const HEADER_TOP_SECTIONS = [
  { label: "క్రీడలు", slug: "sports" },
  { label: "సినిమా", slug: "entertainment" },
];

const HEADER_DROPDOWN = [
  { label: "ఆంధ్రప్రదేశ్", slug: "andhra-pradesh" },
  { label: "తెలంగాణ", slug: "telangana" },
  { label: "జాతీయం", slug: "national" },
  { label: "అంతర్జాతీయం", slug: "international" },
  { label: "బిజినెస్", slug: "business" },
  { label: "టెక్నాలజీ", slug: "technology" },
  { label: "సినిమా రివ్యూలు", slug: "movie-reviews" },
  { label: "పరీక్షా ఫలితాలు", slug: "exam-results" },
  { label: "ఉద్యోగాలు", slug: "jobs" },
  { label: "వ్యవసాయం", slug: "agriculture" },
  { label: "విద్య", slug: "education" },
  { label: "ఆరోగ్యం", slug: "health" },
  { label: "భక్తి", slug: "devotional" },
  { label: "నేరాలు", slug: "crime" },
  { label: "నవ్యసీమ", slug: "navyaseema" },
  { label: "NRI వార్తలు", slug: "nri" },
  { label: "వాతావరణం", slug: "weather" },
  { label: "రియల్ ఎస్టేట్", slug: "real-estate" },
  { label: "సంపాదకీయం", slug: "editorial" },
  { label: "ఎట్టెట", slug: "yetteta" },
];

function catItem(label: string, slug: string) {
  return {
    id: id(),
    label,
    target: { type: "CATEGORY", categorySlug: slug },
    mobileVariant: "show",
    children: [],
  };
}

function districtItem(label: string, slug: string) {
  return {
    id: id(),
    label,
    target: { type: "INTERNAL_URL", url: `/${slug}` },
    mobileVariant: "show",
    children: [],
  };
}

function internalItem(label: string, url: string) {
  return {
    id: id(),
    label,
    target: { type: "INTERNAL_URL", url },
    mobileVariant: "show",
    children: [],
  };
}

const HEADER_ITEMS = [
  ...HEADER_TOP_DISTRICTS.map((d) => districtItem(d.label, d.slug)),
  ...HEADER_TOP_SECTIONS.map((s) => catItem(s.label, s.slug)),
  internalItem("రాశి ఫలాలు", "/horoscope"),
  {
    id: id(),
    label: "మరిన్ని",
    // NONE = label-only dropdown trigger (no link). Replaces the old url:"#"
    // which failed the strict INTERNAL_URL schema and froze header saves.
    target: { type: "NONE" },
    mobileVariant: "show",
    children: HEADER_DROPDOWN.map((c) => ({
      id: id(),
      label: c.label,
      target: { type: "CATEGORY", categorySlug: c.slug },
      mobileVariant: "show",
    })),
  },
];

// Leaf children (no `children` field - max depth 2).
function childInternal(label: string, url: string) {
  return { id: id(), label, target: { type: "INTERNAL_URL", url }, mobileVariant: "show" };
}
function childCat(label: string, slug: string) {
  return { id: id(), label, target: { type: "CATEGORY", categorySlug: slug }, mobileVariant: "show" };
}
function childExternal(label: string, url: string) {
  return { id: id(), label, target: { type: "EXTERNAL_URL", url }, mobileVariant: "show" };
}

// Footer "లింకులు" (Links) column - the E-E-A-T / policy + utility links that
// used to be hardcoded in apps/web footer.tsx. Now admin-managed like the rest.
export const FOOTER_LINKS: { label: string; url: string; external?: boolean }[] = [
  { label: "ePaper", url: "/epaper" },
  { label: "మా గురించి (About)", url: "/about" },
  { label: "Mission", url: "/mission" },
  { label: "Masthead", url: "/masthead" },
  { label: "Ownership & Funding", url: "/ownership" },
  { label: "Ethics Policy", url: "/ethics-policy" },
  { label: "Editorial Standards", url: "/editorial-standards" },
  { label: "Corrections Policy", url: "/corrections-policy" },
  { label: "Diversity Policy", url: "/diversity-policy" },
  { label: "Feedback Policy", url: "/feedback-policy" },
  { label: "సంప్రదించండి (Contact)", url: "/contact" },
  { label: "ప్రకటనలు (Advertise)", url: "mailto:ads@rayalaseemanews.com", external: true },
  { label: "Privacy Policy", url: "/privacy" },
  { label: "Terms of Service", url: "/terms" },
  { label: "Sitemap", url: "/sitemap.xml" },
];

const FOOTER_SECTIONS = [
  { label: "ఆంధ్రప్రదేశ్", slug: "andhra-pradesh" },
  { label: "తెలంగాణ", slug: "telangana" },
  { label: "జాతీయం", slug: "national" },
  { label: "అంతర్జాతీయం", slug: "international" },
  { label: "క్రీడలు", slug: "sports" },
  { label: "బిజినెస్", slug: "business" },
  { label: "సినిమా", slug: "entertainment" },
  { label: "టెక్నాలజీ", slug: "technology" },
  { label: "సినిమా రివ్యూలు", slug: "movie-reviews" },
  { label: "పరీక్షా ఫలితాలు", slug: "exam-results" },
  { label: "ఉద్యోగాలు", slug: "jobs" },
  { label: "ఆరోగ్యం", slug: "health" },
  { label: "భక్తి", slug: "devotional" },
  { label: "NRI వార్తలు", slug: "nri" },
  { label: "వాతావరణం", slug: "weather" },
];

// Footer nav = three NONE column headings, each with leaf children: districts,
// sections, and the policy/links column. Fully admin-managed (only the brand
// blurb, social row, and App-download placeholder stay in apps/web footer.tsx).
const FOOTER_ITEMS = [
  {
    id: id(),
    label: "రాయలసీమ జిల్లాలు",
    target: { type: "NONE" },
    mobileVariant: "show",
    children: HEADER_TOP_DISTRICTS.map((d) => childInternal(d.label, `/${d.slug}`)),
  },
  {
    id: id(),
    label: "విభాగాలు",
    target: { type: "NONE" },
    mobileVariant: "show",
    children: [
      ...FOOTER_SECTIONS.map((s) => childCat(s.label, s.slug)),
      // Horoscope is a dedicated page, not a category - link it directly.
      childInternal("రాశి ఫలాలు", "/horoscope"),
    ],
  },
  {
    id: id(),
    label: "లింకులు",
    target: { type: "NONE" },
    mobileVariant: "show",
    children: FOOTER_LINKS.map((l) => (l.external ? childExternal(l.label, l.url) : childInternal(l.label, l.url))),
  },
];

// Mobile bottom-sheet - two NONE columns (districts + sections) matching the
// drawer's two sections (chip row + category grid). The web reads the first
// column as district chips and the rest as the category grid.
const MOBILE_ITEMS = [
  {
    id: id(),
    label: "రాయలసీమ జిల్లాలు",
    target: { type: "NONE" },
    mobileVariant: "show",
    children: HEADER_TOP_DISTRICTS.map((d) => childInternal(d.label, `/${d.slug}`)),
  },
  {
    id: id(),
    label: "విభాగాలు",
    target: { type: "NONE" },
    mobileVariant: "show",
    children: [
      ...HEADER_TOP_SECTIONS.map((s) => childCat(s.label, s.slug)),
      childInternal("రాశి ఫలాలు", "/horoscope"),
      ...HEADER_DROPDOWN.map((c) => childCat(c.label, c.slug)),
    ],
  },
];

async function seed(location: MenuLocation, name: string, items: unknown[]) {
  const existing = await prisma.menu.findUnique({ where: { location } });
  if (existing) {
    console.log(`  ${location}: already exists (id ${existing.id}) - skipping.`);
    return;
  }
  const m = await prisma.menu.create({
    data: {
      location,
      name,
      items: items as any,
      isPublished: true,
      publishedAt: new Date(),
    },
  });
  console.log(`  ${location}: created ${name} with ${items.length} top items (id ${m.id}).`);
}

async function main() {
  console.log("Seeding menus (idempotent - skips existing locations)...");
  await seed(MenuLocation.HEADER, "Header navigation", HEADER_ITEMS);
  await seed(MenuLocation.FOOTER, "Footer links", FOOTER_ITEMS);
  await seed(MenuLocation.MOBILE, "Mobile bottom sheet", MOBILE_ITEMS);
  console.log("Done.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
