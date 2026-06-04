// Idempotent: add the "లింకులు" (policy/links) column to the FOOTER menu if it
// isn't already there. The footer used to hardcode this column in apps/web
// footer.tsx; it's now admin-managed like the rest of the footer. Existing
// footer menus (already reshaped into 2 columns) need this third column added
// once. fix-menu-targets only reshapes a FLAT footer, so it can't upgrade an
// already-2-column footer - hence this additive patch. No-ops once present.
//
// Run from the deploy after fix-menu-targets.ts. Kept in sync with FOOTER_LINKS
// in seed-menus.ts.
import { prisma, MenuLocation, Prisma } from "../src/index";

function id() {
  return "itm_" + Math.random().toString(36).slice(2, 11);
}
const childInternal = (label: string, url: string) =>
  ({ id: id(), label, target: { type: "INTERNAL_URL", url }, mobileVariant: "show" });
const childExternal = (label: string, url: string) =>
  ({ id: id(), label, target: { type: "EXTERNAL_URL", url }, mobileVariant: "show" });

function linksColumn() {
  return {
    id: id(),
    label: "లింకులు",
    target: { type: "NONE" },
    mobileVariant: "show",
    children: [
      childInternal("ePaper", "/epaper"),
      childInternal("మా గురించి (About)", "/about"),
      childInternal("Mission", "/mission"),
      childInternal("Masthead", "/masthead"),
      childInternal("Ownership & Funding", "/ownership"),
      childInternal("Ethics Policy", "/ethics-policy"),
      childInternal("Editorial Standards", "/editorial-standards"),
      childInternal("Corrections Policy", "/corrections-policy"),
      childInternal("Diversity Policy", "/diversity-policy"),
      childInternal("Feedback Policy", "/feedback-policy"),
      childInternal("సంప్రదించండి (Contact)", "/contact"),
      childExternal("ప్రకటనలు (Advertise)", "mailto:ads@rayalaseemanews.com"),
      childInternal("Privacy Policy", "/privacy"),
      childInternal("Terms of Service", "/terms"),
      childInternal("Sitemap", "/sitemap.xml"),
    ],
  };
}

// Already has the links column? (label match, or a child pointing at /privacy.)
function hasLinks(items: any[]): boolean {
  return items.some(
    (it) =>
      it?.label === "లింకులు" ||
      (Array.isArray(it?.children) && it.children.some((c: any) => c?.target?.url === "/privacy")),
  );
}

async function main() {
  const menu = await prisma.menu.findUnique({ where: { location: MenuLocation.FOOTER } });
  if (!menu) {
    console.log("[patch-footer-links] FOOTER: no menu row - skipping.");
    return;
  }
  const items = Array.isArray(menu.items) ? (menu.items as any[]) : [];
  const draft = Array.isArray(menu.draftItems) ? (menu.draftItems as any[]) : null;

  const data: Prisma.MenuUpdateInput = {};
  if (!hasLinks(items)) {
    data.items = [...items, linksColumn()] as any;
    data.isPublished = true;
    data.publishedAt = new Date();
  }
  if (draft && !hasLinks(draft)) {
    data.draftItems = [...draft, linksColumn()] as any;
  }

  if (Object.keys(data).length === 0) {
    console.log("[patch-footer-links] FOOTER: లింకులు column already present - no-op.");
    return;
  }
  await prisma.menu.update({ where: { id: menu.id }, data });
  console.log("[patch-footer-links] FOOTER: added లింకులు column.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
