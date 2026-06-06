// One-off (idempotent) layout patch: merge the homepage's 2-column
// CategoryPair blocks into 4-column ("4-in-a-row") rows.
//
// Why: the "Default Homepage" template ships (via seed-templates.ts) with its
// category section as several 2-column CategoryPair blocks. We want them shown
// 4-across. seed-templates.ts is skip-if-exists, so it can't reshape an
// already-seeded prod template - this patches the stored layout (and
// draftLayout) JSON in place, the same way patch-section-band-tabs.ts does.
//
// What it does: walks the block list, finds the CategoryPair blocks in order,
// and merges them pairwise - (1st+2nd), (3rd+4th), ... - by concatenating the
// second block's `columns` onto the first and dropping the second. All other
// blocks (ads, bands, etc.) stay exactly where they are.
//
// Idempotent: re-running is a no-op once a CategoryPair already has >2 columns.
// The full DB is pg_dump'd by the deploy immediately before this runs, so the
// before/after column layout is just logged to stdout for reference.
//
// Run from the deploy after seed-templates.ts / patch-section-band-tabs.ts.

import { prisma } from "../src/index";

const TEMPLATE_NAME = "Default Homepage";

type Column = { slug: string; title: string; leadCount: number; itemsCount: number };
type Block = { id: string; type?: string; config?: { columns?: Column[] } };
type Layout = { blocks?: Block[] } | Block[] | null;

function getBlocks(layout: Layout): { arr: Block[]; wrap: (a: Block[]) => unknown } | null {
  if (!layout) return null;
  if (Array.isArray(layout)) return { arr: layout, wrap: (a) => a };
  if (Array.isArray(layout.blocks)) return { arr: layout.blocks, wrap: (a) => ({ ...layout, blocks: a }) };
  return null;
}

function describe(blocks: Block[]): string {
  return blocks
    .filter((b) => b?.type === "CategoryPair")
    .map((b) => `[${(b.config?.columns ?? []).map((c) => c.slug).join(",")}]`)
    .join(" ");
}

/** Merge consecutive CategoryPair blocks pairwise. Returns a NEW array; never
 *  mutates the input. `changed=false` when already merged or nothing to do. */
function mergeCategoryPairs(blocks: Block[]): { blocks: Block[]; changed: boolean; note: string } {
  const cps = blocks.map((b, i) => ({ b, i })).filter((x) => x.b && x.b.type === "CategoryPair");

  if (cps.some((x) => (x.b.config?.columns?.length ?? 0) > 2))
    return { blocks, changed: false, note: "already merged (a CategoryPair already has >2 columns)" };
  if (cps.length < 2) return { blocks, changed: false, note: `only ${cps.length} CategoryPair block(s) - nothing to merge` };

  const out: Block[] = structuredClone(blocks);
  const cols = new Map<string, Column[]>();
  for (const { b } of cps) cols.set(b.id, b.config?.columns ?? []);

  const remove = new Set<string>();
  for (let k = 0; k + 1 < cps.length; k += 2) {
    const firstId = cps[k].b.id;
    const secondId = cps[k + 1].b.id;
    const target = out.find((b) => b.id === firstId)!;
    target.config = target.config ?? {};
    target.config.columns = [...cols.get(firstId)!, ...cols.get(secondId)!];
    remove.add(secondId);
  }
  return {
    blocks: out.filter((b) => !remove.has(b.id)),
    changed: true,
    note: `merged ${cps.length} CategoryPair blocks (2 cols) into ${Math.ceil(cps.length / 2)} block(s) of 4 cols`,
  };
}

async function main() {
  const tpl = await prisma.template.findFirst({
    where: { name: TEMPLATE_NAME },
    select: { id: true, name: true, layout: true, draftLayout: true },
  });
  if (!tpl) {
    console.log(`[merge-homepage-4up] No template named "${TEMPLATE_NAME}" - skipping.`);
    return;
  }

  const update: Record<string, unknown> = {};
  for (const key of ["layout", "draftLayout"] as const) {
    const got = getBlocks(tpl[key] as Layout);
    if (!got) continue;
    const res = mergeCategoryPairs(got.arr);
    if (res.changed) {
      console.log(`[merge-homepage-4up] ${key}: ${res.note}`);
      console.log(`[merge-homepage-4up]   before: ${describe(got.arr)}`);
      console.log(`[merge-homepage-4up]   after:  ${describe(res.blocks)}`);
      update[key] = got.wrap(res.blocks);
    } else {
      console.log(`[merge-homepage-4up] ${key}: ${res.note} - no change.`);
    }
  }

  if (Object.keys(update).length === 0) {
    console.log("[merge-homepage-4up] Done. Nothing to change.");
    return;
  }

  await prisma.template.update({ where: { id: tpl.id }, data: update });
  console.log(`[merge-homepage-4up] Done. Updated ${Object.keys(update).join(", ")} on "${tpl.name}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
