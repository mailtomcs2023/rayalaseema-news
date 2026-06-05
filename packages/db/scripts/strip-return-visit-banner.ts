// One-off migration (2026-06-05): the ReturnVisitBanner page-builder block
// was ripped out of the codebase. Its block type is gone from the Zod
// `blockSchema`, so any stored layout that still contains a
// `{ type: "ReturnVisitBanner" }` block now FAILS layoutSchema validation -
// which makes TemplateRenderer fall back to <EmptyTemplate> and blank the
// whole page. This script scrubs the block from every persisted layout so
// the remaining blocks keep rendering.
//
// Idempotent: re-running it is a no-op once no layout references the block.
//
// Run via: bunx tsx packages/db/scripts/strip-return-visit-banner.ts

import { prisma } from "../src";

const DEAD_TYPE = "ReturnVisitBanner";

type Block = { type?: string; [k: string]: unknown };

/** Remove dead blocks from a `{ version, blocks: [] }` layout object. Returns
 *  the cleaned value + how many blocks were dropped (0 ⇒ unchanged). */
function stripFromLayout(layout: unknown): { value: unknown; removed: number } {
  if (!layout || typeof layout !== "object" || !Array.isArray((layout as { blocks?: unknown }).blocks)) {
    return { value: layout, removed: 0 };
  }
  const obj = layout as { blocks: Block[] };
  const kept = obj.blocks.filter((b) => b?.type !== DEAD_TYPE);
  return { value: { ...obj, blocks: kept }, removed: obj.blocks.length - kept.length };
}

/** Remove dead blocks from a bare block array (CompositeBlock.blocks shape). */
function stripFromBlockArray(blocks: unknown): { value: unknown; removed: number } {
  if (!Array.isArray(blocks)) return { value: blocks, removed: 0 };
  const arr = blocks as Block[];
  const kept = arr.filter((b) => b?.type !== DEAD_TYPE);
  return { value: kept, removed: arr.length - kept.length };
}

async function main() {
  let totalRemoved = 0;

  // --- Templates: layout (published) + draftLayout ---
  const templates = await prisma.template.findMany({
    select: { id: true, slug: true, layout: true, draftLayout: true },
  });
  for (const t of templates) {
    const pub = stripFromLayout(t.layout);
    const draft = t.draftLayout != null ? stripFromLayout(t.draftLayout) : { value: t.draftLayout, removed: 0 };
    if (pub.removed || draft.removed) {
      await prisma.template.update({
        where: { id: t.id },
        data: {
          ...(pub.removed ? { layout: pub.value as object } : {}),
          ...(draft.removed ? { draftLayout: draft.value as object } : {}),
        },
      });
      totalRemoved += pub.removed + draft.removed;
      console.log(`  ✓ template "${t.slug}" - dropped ${pub.removed + draft.removed} block(s)`);
    }
  }

  // --- TemplateVersion snapshots (restorable history) ---
  const versions = await prisma.templateVersion.findMany({ select: { id: true, layout: true } });
  for (const v of versions) {
    const res = stripFromLayout(v.layout);
    if (res.removed) {
      await prisma.templateVersion.update({ where: { id: v.id }, data: { layout: res.value as object } });
      totalRemoved += res.removed;
      console.log(`  ✓ templateVersion ${v.id} - dropped ${res.removed} block(s)`);
    }
  }

  // --- CompositeBlocks (bare block arrays) ---
  const composites = await prisma.compositeBlock.findMany({ select: { id: true, name: true, blocks: true } });
  for (const c of composites) {
    const res = stripFromBlockArray(c.blocks);
    if (res.removed) {
      await prisma.compositeBlock.update({ where: { id: c.id }, data: { blocks: res.value as object } });
      totalRemoved += res.removed;
      console.log(`  ✓ composite "${c.name}" - dropped ${res.removed} block(s)`);
    }
  }

  console.log(`Done. Removed ${totalRemoved} ReturnVisitBanner block(s) total.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
