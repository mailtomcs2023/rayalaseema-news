// One-off (idempotent) fix: make SectionBand filter tabs actually filter.
//
// Why: the page-builder SectionBand tabs (e.g. రాజకీయం → ఆంధ్రప్రదేశ్ / జాతీయం)
// render as plain links. Two problems on the live homepage template:
//   1. The component now supports IN-PLACE filtering keyed off each tab's
//      category, but existing tabs in the DB layout have no `categorySlug`.
//   2. The "ఆంధ్రప్రదేశ్" tab points at /category/politics - the band's OWN
//      category - so even a working filter would show identical content.
// seed-templates.ts is skip-if-exists, so it can't repair an already-seeded
// template. This patches the stored layout (and draftLayout) JSON in place.
//
// What it does, for every SectionBand block in every template:
//   - Backfill `categorySlug` on each tab from its `/category/<slug>` href.
//   - Repair the politics band's ఆంధ్రప్రదేశ్ tab: repoint href + categorySlug
//     to `andhra-pradesh` (was `politics`).
// Idempotent: re-running is a no-op once tabs already carry the right slugs.
// Run from the deploy after seed-templates.ts.

import { prisma } from "../src/index";

type Tab = { label: string; href: string; categorySlug?: string };
type Block = { type?: string; config?: { categorySlug?: string; tabs?: Tab[] } };
type Layout = { blocks?: Block[] };

function slugFromHref(href: string): string | null {
  const m = href.match(/^\/category\/([^/?#]+)/);
  return m ? m[1] : null;
}

// Known mis-links: tabs that point at the band's OWN category (so they can't
// filter) and should be repointed to a distinct sub-category. Keyed by band
// category slug + tab label.
const REPOINT: Record<string, Record<string, string>> = {
  politics: { "ఆంధ్రప్రదేశ్": "andhra-pradesh" },
  sports: { "క్రికెట్": "cricket", "ఐపీఎల్": "ipl" },
};

// Returns the patched tab plus whether anything changed.
function patchTab(tab: Tab, bandSlug: string | undefined): { tab: Tab; changed: boolean } {
  let next = { ...tab };
  let changed = false;

  // Repair known mis-links: a tab pointing at the band's own category gets
  // repointed to its intended sub-category (e.g. politics→AP, sports→cricket).
  const target = bandSlug ? REPOINT[bandSlug]?.[tab.label] : undefined;
  if (target && slugFromHref(tab.href) === bandSlug) {
    next = { ...next, href: `/category/${target}`, categorySlug: target };
    changed = true;
  }

  // Backfill categorySlug from the href when absent.
  if (!next.categorySlug) {
    const s = slugFromHref(next.href);
    if (s) {
      next = { ...next, categorySlug: s };
      changed = true;
    }
  }

  return { tab: next, changed };
}

// Patches a layout object in place-ish; returns a new layout + change count.
function patchLayout(layout: unknown): { layout: unknown; changes: number } {
  if (!layout || typeof layout !== "object") return { layout, changes: 0 };
  const l = layout as Layout;
  if (!Array.isArray(l.blocks)) return { layout, changes: 0 };

  let changes = 0;
  const blocks = l.blocks.map((block) => {
    if (block?.type !== "SectionBand" || !Array.isArray(block.config?.tabs)) return block;
    const bandSlug = block.config?.categorySlug;
    const tabs = block.config!.tabs!.map((t) => {
      const { tab, changed } = patchTab(t, bandSlug);
      if (changed) changes++;
      return tab;
    });
    return { ...block, config: { ...block.config, tabs } };
  });

  return { layout: { ...l, blocks }, changes };
}

async function main() {
  const templates = await prisma.template.findMany({
    select: { id: true, slug: true, layout: true, draftLayout: true },
  });

  let touched = 0;
  for (const tpl of templates) {
    const pub = patchLayout(tpl.layout);
    const draft = patchLayout(tpl.draftLayout);
    const totalChanges = pub.changes + draft.changes;
    if (totalChanges === 0) {
      console.log(`[patch-section-band-tabs] ${tpl.slug}: no SectionBand tab changes - skip.`);
      continue;
    }
    await prisma.template.update({
      where: { id: tpl.id },
      data: {
        layout: pub.layout as object,
        ...(tpl.draftLayout ? { draftLayout: draft.layout as object } : {}),
      },
    });
    touched++;
    console.log(
      `[patch-section-band-tabs] ${tpl.slug}: patched ${totalChanges} tab(s) ` +
        `(layout ${pub.changes}, draft ${draft.changes}).`,
    );
  }

  console.log(`[patch-section-band-tabs] Done. ${touched} template(s) updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
