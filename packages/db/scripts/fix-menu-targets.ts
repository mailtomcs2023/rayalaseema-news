// Idempotent repair for already-published Menu rows (run once on deploy, after
// seed-menus.ts). Two fixes:
//
//   1. ALL locations: rewrite any legacy dropdown-trigger target
//      { type: "INTERNAL_URL", url: "#" }  ->  { type: "NONE" }
//      in both `items` and `draftItems`. The old "#" value fails the strict
//      INTERNAL_URL schema (/^\/.*/), which made the HEADER menu impossible to
//      save or publish from the admin (PUT/POST .../draft|publish -> 400).
//
//   2. FOOTER + MOBILE: these were hardcoded in apps/web until now, so the DB
//      menus were never rendered and hold the old flat shape. The new footer.tsx
//      and the mobile drawer render each top-level item as a column (heading +
//      child links), so a flat list would paint empty/odd columns. If no top-
//      level item has children, replace `items` with the canonical two-column
//      shape (districts + sections). draftItems is cleared so the editor starts
//      from the fix.
//
// Idempotent: re-running makes no further changes once the data is clean.

import { prisma, MenuLocation, Prisma } from "../src/index";

function id() {
  return "itm_" + Math.random().toString(36).slice(2, 11);
}

// --- Fix 1: "#" INTERNAL_URL -> NONE, recursively ---------------------------
function fixHashTargets(items: any[]): { items: any[]; changed: number } {
  let changed = 0;
  const walk = (list: any[]): any[] =>
    list.map((it) => {
      const next = { ...it };
      if (next?.target?.type === "INTERNAL_URL" && next.target.url === "#") {
        next.target = { type: "NONE" };
        changed++;
      }
      if (Array.isArray(next.children) && next.children.length > 0) {
        next.children = walk(next.children);
      }
      return next;
    });
  return { items: walk(items), changed };
}

// --- Fix 2: canonical two-column shapes -------------------------------------
const DISTRICTS = [
  { label: "కర్నూలు", slug: "kurnool" },
  { label: "నంద్యాల", slug: "nandyal" },
  { label: "అనంతపురం", slug: "ananthapuramu" },
  { label: "శ్రీ సత్యసాయి", slug: "sri-sathya-sai" },
  { label: "వై.యస్.ఆర్", slug: "ysr-kadapa" },
  { label: "తిరుపతి", slug: "tirupati" },
  { label: "అన్నమయ్య", slug: "annamayya" },
  { label: "చిత్తూరు", slug: "chittoor" },
];
// Footer sections - a curated short list.
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
// Mobile sections - the fuller category set (mirrors the header's top sections
// + dropdown), since the drawer is the primary phone nav.
const MOBILE_SECTIONS = [
  { label: "క్రీడలు", slug: "sports" },
  { label: "సినిమా", slug: "entertainment" },
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

const childInternal = (label: string, url: string) =>
  ({ id: id(), label, target: { type: "INTERNAL_URL", url }, mobileVariant: "show" });
const childCat = (label: string, slug: string) =>
  ({ id: id(), label, target: { type: "CATEGORY", categorySlug: slug }, mobileVariant: "show" });

// Two NONE columns: districts + sections (+ horoscope page link).
function canonicalColumns(sections: { label: string; slug: string }[]) {
  return [
    {
      id: id(),
      label: "రాయలసీమ జిల్లాలు",
      target: { type: "NONE" },
      mobileVariant: "show",
      children: DISTRICTS.map((d) => childInternal(d.label, `/${d.slug}`)),
    },
    {
      id: id(),
      label: "విభాగాలు",
      target: { type: "NONE" },
      mobileVariant: "show",
      children: [
        ...sections.map((s) => childCat(s.label, s.slug)),
        childInternal("రాశి ఫలాలు", "/horoscope"),
      ],
    },
  ];
}

async function fixLocation(location: MenuLocation) {
  const menu = await prisma.menu.findUnique({ where: { location } });
  if (!menu) {
    console.log(`[fix-menu-targets] ${location}: no menu row - skipping.`);
    return;
  }

  const data: Prisma.MenuUpdateInput = {};
  let summary: string[] = [];

  // Fix 1 - applies to items + draftItems on every location.
  const itemsArr = Array.isArray(menu.items) ? (menu.items as any[]) : [];
  const fixedItems = fixHashTargets(itemsArr);
  if (fixedItems.changed > 0) {
    data.items = fixedItems.items as any;
    summary.push(`items: ${fixedItems.changed} "#"->NONE`);
  }
  if (Array.isArray(menu.draftItems)) {
    const fixedDraft = fixHashTargets(menu.draftItems as any[]);
    if (fixedDraft.changed > 0) {
      data.draftItems = fixedDraft.items as any;
      summary.push(`draftItems: ${fixedDraft.changed} "#"->NONE`);
    }
  }

  // Fix 2 - FOOTER + MOBILE: reshape flat -> two columns if nothing is nested.
  if (location === MenuLocation.FOOTER || location === MenuLocation.MOBILE) {
    const current = (data.items as any[]) ?? itemsArr;
    const hasColumns = current.some((it) => Array.isArray(it?.children) && it.children.length > 0);
    if (!hasColumns) {
      const sections = location === MenuLocation.FOOTER ? FOOTER_SECTIONS : MOBILE_SECTIONS;
      data.items = canonicalColumns(sections) as any;
      data.draftItems = Prisma.DbNull;
      data.isPublished = true;
      data.publishedAt = new Date();
      summary = summary.filter((s) => !s.startsWith("items")); // superseded
      summary.push("items: reshaped to 2 columns (districts + sections)");
    }
  }

  if (Object.keys(data).length === 0) {
    console.log(`[fix-menu-targets] ${location}: already clean - no-op.`);
    return;
  }
  await prisma.menu.update({ where: { id: menu.id }, data });
  console.log(`[fix-menu-targets] ${location}: ${summary.join("; ")}.`);
}

async function main() {
  await fixLocation(MenuLocation.HEADER);
  await fixLocation(MenuLocation.MOBILE);
  await fixLocation(MenuLocation.FOOTER);
  console.log("[fix-menu-targets] Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
