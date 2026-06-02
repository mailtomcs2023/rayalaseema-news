// One-command local bootstrap: make a fresh local DB look like production.
//
// Runs the same idempotent structural seeds the deploy runs, force-refreshes
// the user-config menus (so local exactly matches the seed instead of drifting
// into a half-empty state), then imports demo content from the live public API
// and scatters it across districts.
//
//   cd packages/db && bunx tsx scripts/setup-local.ts
//   (or: bun run db:setup:local from the repo root)
//
// SAFETY: refuses to run unless DATABASE_URL points at localhost / 127.0.0.1,
// so the demo-content import can never touch a remote / production database.
//
// Idempotent: safe to re-run. Reference seeds upsert; the menu reset + reseed
// repairs drift; the article import skips slugs that already exist.

import { spawnSync } from "node:child_process";
import { prisma } from "../src/index";

const url = process.env.DATABASE_URL || "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error(
    `\n✗ Refusing to run: DATABASE_URL is not local.\n` +
      `  Got: ${url.replace(/:[^:@/]+@/, ":***@") || "(unset)"}\n` +
      `  This script writes demo data - point it at a local DB only.\n`,
  );
  process.exit(1);
}

function step(script: string) {
  console.log(`\n──────── ${script} ────────`);
  const r = spawnSync(`bunx tsx scripts/${script}`, { stdio: "inherit", shell: true });
  if (r.status !== 0) console.warn(`  ⚠ ${script} exited with ${r.status} (continuing)`);
}

async function main() {
  // 1) Structural / reference data - idempotent upserts.
  step("seed-categories.ts");
  step("seed-subgenre-categories.ts");
  step("rebuild-constituencies.ts");
  step("seed-desks.ts");
  step("backfill-desks.ts");
  step("seed-epaper-templates.ts");
  step("seed-epaper-masters.ts");
  step("seed-templates.ts"); // Page Builder homepage/category templates
  step("seed-category-tags.ts");

  // 2) User-config menus. seed-menus is skip-if-exists (to preserve admin
  //    edits in prod); locally we want an exact match, so force-recreate.
  console.log("\n──────── reset HEADER menu (local parity) ────────");
  await prisma.menu.deleteMany({ where: { location: "HEADER" } });
  await prisma.$disconnect();
  step("seed-menus.ts");
  step("patch-header-horoscope.ts");

  // 3) Demo content from the live public API + scatter across districts.
  step("import-articles-from-api.ts");
  step("assign-imported-constituencies.ts");

  console.log("\n✅ Local bootstrap complete. Restart `bun dev` and open http://localhost:3000\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
