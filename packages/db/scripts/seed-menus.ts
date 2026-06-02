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
    target: { type: "INTERNAL_URL", url: `/district/${slug}` },
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
    target: { type: "INTERNAL_URL", url: "#" },
    mobileVariant: "show",
    children: HEADER_DROPDOWN.map((c) => ({
      id: id(),
      label: c.label,
      target: { type: "CATEGORY", categorySlug: c.slug },
      mobileVariant: "show",
    })),
  },
];

const FOOTER_ITEMS = [
  catItem("ఆంధ్రప్రదేశ్", "andhra-pradesh"),
  catItem("జాతీయం", "national"),
  catItem("క్రీడలు", "sports"),
  catItem("సినిమా", "entertainment"),
  catItem("వ్యవసాయం", "agriculture"),
  catItem("భక్తి", "devotional"),
  {
    id: id(),
    label: "About",
    target: { type: "INTERNAL_URL", url: "/about" },
    mobileVariant: "show",
    children: [],
  },
  {
    id: id(),
    label: "Privacy",
    target: { type: "INTERNAL_URL", url: "/privacy" },
    mobileVariant: "show",
    children: [],
  },
  {
    id: id(),
    label: "Contact",
    target: { type: "INTERNAL_URL", url: "/contact" },
    mobileVariant: "show",
    children: [],
  },
];

// Mobile bottom-sheet - same as header districts + sections, no dropdown
// (mobile already shows a slide-out list, no need to nest).
const MOBILE_ITEMS = [
  ...HEADER_TOP_DISTRICTS.map((d) => districtItem(d.label, d.slug)),
  ...HEADER_TOP_SECTIONS.map((s) => catItem(s.label, s.slug)),
  internalItem("రాశి ఫలాలు", "/horoscope"),
  ...HEADER_DROPDOWN.map((c) => catItem(c.label, c.slug)),
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
