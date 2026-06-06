// One-off: merge the homepage "Default Homepage" template's 2-column
// CategoryPair blocks into 4-column blocks (the "4-in-a-row" layout).
//
// SAFE BY DEFAULT: runs as a DRY RUN unless you pass --apply. It always writes
// a full backup of the original layout/draftLayout JSON to scripts/backups/
// before changing anything, and is idempotent (re-running after a successful
// merge is a no-op).
//
// Run ON the production VM (where DATABASE_URL points at the prod DB):
//   bun scripts/merge-homepage-4up.mjs            # dry run - shows the plan
//   bun scripts/merge-homepage-4up.mjs --apply    # writes the change
//
// Rollback: restore the JSON from the printed backup file into the template's
// layout/draftLayout columns.

import { prisma } from "@rayalaseema/db";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const TEMPLATE_NAME = "Default Homepage";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backupDir = join(__dirname, "backups");

/** Merge consecutive CategoryPair blocks pairwise: (0,1),(2,3),...
 *  Returns a NEW blocks array; does not mutate the input. */
function mergeCategoryPairs(blocks) {
  const cps = blocks
    .map((b, i) => ({ b, i }))
    .filter((x) => x.b && x.b.type === "CategoryPair");

  const anyWide = cps.some((x) => (x.b.config?.columns?.length || 0) > 2);
  if (anyWide) return { blocks, changed: false, note: "already merged (a CategoryPair already has >2 columns)" };
  if (cps.length < 2) return { blocks, changed: false, note: `only ${cps.length} CategoryPair block(s) - nothing to merge` };

  // Deep clone so we never touch the originals (the backup must stay pristine).
  const out = structuredClone(blocks);
  const idToColumns = new Map();
  for (const { b } of cps) idToColumns.set(b.id, b.config?.columns || []);

  const removeIds = new Set();
  for (let k = 0; k + 1 < cps.length; k += 2) {
    const firstId = cps[k].b.id;
    const secondId = cps[k + 1].b.id;
    const target = out.find((b) => b.id === firstId);
    target.config = target.config || {};
    target.config.columns = [...idToColumns.get(firstId), ...idToColumns.get(secondId)];
    removeIds.add(secondId);
  }
  const filtered = out.filter((b) => !removeIds.has(b.id));
  return {
    blocks: filtered,
    changed: true,
    note: `merged ${cps.length} CategoryPair blocks (2 cols each) into ${Math.ceil(cps.length / 2)} block(s) of 4 cols`,
  };
}

function getArr(layout) {
  if (!layout) return null;
  if (Array.isArray(layout)) return { arr: layout, wrap: (a) => a };
  if (Array.isArray(layout.blocks)) return { arr: layout.blocks, wrap: (a) => ({ ...layout, blocks: a }) };
  return null;
}

function describe(blocks) {
  return blocks
    .filter((b) => b?.type === "CategoryPair")
    .map((b) => `[${(b.config?.columns || []).map((c) => c.slug).join(",")}]`)
    .join(" ");
}

async function main() {
  const tpl = await prisma.template.findFirst({
    where: { name: TEMPLATE_NAME },
    select: { id: true, name: true, layout: true, draftLayout: true },
  });
  if (!tpl) {
    console.error(`✗ No template named "${TEMPLATE_NAME}" found.`);
    process.exit(1);
  }

  console.log(`Template: ${tpl.id} "${tpl.name}"`);
  console.log(`Mode: ${APPLY ? "APPLY (will write)" : "DRY RUN (no write)"}\n`);

  // Backup BEFORE anything.
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = join(backupDir, `homepage-${tpl.id}-${stamp}.json`);
  writeFileSync(backupFile, JSON.stringify({ id: tpl.id, name: tpl.name, layout: tpl.layout, draftLayout: tpl.draftLayout }, null, 2));
  console.log(`Backup written: ${backupFile}\n`);

  const update = {};
  for (const key of ["layout", "draftLayout"]) {
    const got = getArr(tpl[key]);
    if (!got) {
      console.log(`[${key}] empty/unrecognized - skipped`);
      continue;
    }
    console.log(`[${key}] BEFORE: ${describe(got.arr) || "(no CategoryPair)"}`);
    const res = mergeCategoryPairs(got.arr);
    console.log(`[${key}] ${res.note}`);
    if (res.changed) {
      console.log(`[${key}] AFTER:  ${describe(res.blocks)}`);
      update[key] = got.wrap(res.blocks);
    }
    console.log("");
  }

  if (Object.keys(update).length === 0) {
    console.log("Nothing to change. Done.");
    return;
  }

  if (!APPLY) {
    console.log("DRY RUN - no changes written. Re-run with --apply to commit.");
    return;
  }

  await prisma.template.update({ where: { id: tpl.id }, data: update });
  console.log(`✓ Applied. Updated: ${Object.keys(update).join(", ")}`);
  console.log(`  Rollback: restore from ${backupFile}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
