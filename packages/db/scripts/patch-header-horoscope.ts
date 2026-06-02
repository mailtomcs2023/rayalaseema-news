// One-off (idempotent) fix: add "రాశి ఫలాలు" (/horoscope) to the published
// HEADER + MOBILE menus.
//
// Why: the hardcoded fallback nav in apps/web/src/components/header.tsx lists
// రాశి ఫలాలు, but the seeded Menu-Builder menus never included it (and seed
// is skip-if-exists, so re-seeding can't add it). On the live site the
// fallback paints first, then the client swaps in the DB menu and the item
// vanishes. This patches the existing menu rows so the DB menu matches the
// fallback - the item stays and the swap becomes invisible.
//
// Idempotent: if a /horoscope item is already present it leaves the menu
// untouched. Run from the deploy after seed-menus.ts.

import { prisma, MenuLocation } from "../src/index";

const HOROSCOPE_URL = "/horoscope";

function horoscopeItem() {
  return {
    id: "itm_horoscope",
    label: "రాశి ఫలాలు",
    target: { type: "INTERNAL_URL", url: HOROSCOPE_URL },
    mobileVariant: "show",
    children: [],
  };
}

function hasHoroscope(items: any[]): boolean {
  return items.some(
    (it) => it?.target?.type === "INTERNAL_URL" && it?.target?.url === HOROSCOPE_URL,
  );
}

// Insert right after the "entertainment" (సినిమా) category item to match the
// hardcoded fallback order; else just before the first dropdown (children)
// item; else append.
function withHoroscope(items: any[]): any[] {
  const next = [...items];
  const afterEntertainment = next.findIndex(
    (it) => it?.target?.type === "CATEGORY" && it?.target?.categorySlug === "entertainment",
  );
  if (afterEntertainment >= 0) {
    next.splice(afterEntertainment + 1, 0, horoscopeItem());
    return next;
  }
  const firstDropdown = next.findIndex(
    (it) => Array.isArray(it?.children) && it.children.length > 0,
  );
  if (firstDropdown >= 0) {
    next.splice(firstDropdown, 0, horoscopeItem());
    return next;
  }
  next.push(horoscopeItem());
  return next;
}

async function patch(location: MenuLocation) {
  const menu = await prisma.menu.findUnique({ where: { location } });
  if (!menu) {
    console.log(`[patch-header-horoscope] ${location}: no menu row - skipping.`);
    return;
  }
  const items = Array.isArray(menu.items) ? (menu.items as any[]) : [];
  if (hasHoroscope(items)) {
    console.log(`[patch-header-horoscope] ${location}: రాశి ఫలాలు already present - no-op.`);
    return;
  }
  const updated = withHoroscope(items);
  await prisma.menu.update({
    where: { location },
    data: { items: updated as any, isPublished: true, publishedAt: new Date() },
  });
  console.log(`[patch-header-horoscope] ${location}: added రాశి ఫలాలు (${items.length} -> ${updated.length} top items).`);
}

async function main() {
  await patch(MenuLocation.HEADER);
  await patch(MenuLocation.MOBILE);
  console.log("[patch-header-horoscope] Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
