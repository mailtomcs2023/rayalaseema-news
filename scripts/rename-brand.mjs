#!/usr/bin/env node
// One-shot brand-rename script. Walks repo, replaces brand/domain/slug strings.
// Idempotent. Skips historical docs, mockups, build output, node_modules, .git, locks.
//
// Run:  node scripts/rename-brand.mjs           # dry-run
//       node scripts/rename-brand.mjs --apply   # write changes

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, sep, basename, extname } from "node:path";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", ".turbo", "dist", "build", ".vercel", ".cache",
  "mockups",          // old design references — preserve as-is
  ".superpowers",     // historical brainstorm artifacts
]);
const SKIP_DIR_PATHS = [
  join("docs", "superpowers", "specs"),       // historical specs
];
const SKIP_FILES = new Set([
  join(ROOT, "bun.lock"),
  join(ROOT, "ULTRAREVIEW_REPORT.md"),
  join(ROOT, ".env.local"),
  join(ROOT, "packages", "db", "prisma", "rayalaseema-dialect.json"),
  join(ROOT, "scripts", "rename-brand.mjs"),  // do not edit self
  join(ROOT, ".claude", "settings.json"),     // perm allow-list — contains old creds, handle separately
  join(ROOT, ".claude", "settings.local.json"),
  join(ROOT, "docker-compose.yml"),           // DB name rename is a separate ops migration
]);
// SVGs intentionally excluded: wordmarks contain binary-encoded font glyphs,
// not editable text — replacing the literal string in metadata breaks nothing
// visible but also doesn't refresh the rendered logo. Logos handled as a
// separate task with new wordmark artwork.
const ALLOWED_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".md", ".mdx", ".html", ".css", ".scss",
  ".xml", ".yml", ".yaml", ".prisma", ".txt", ".example",
]);

// Telugu chars
const RAYA = "రాయలసీమ";          // రాయలసీమ
const EXP_ZWNJ = "ఎక్స్‌ప్రెస్"; // ఎక్స్‌ప్రెస్ (with ZWNJ)
const EXP_NO_ZWNJ = "ఎక్స్ప్రెస్";    // ఎక్స్ప్రెస్
const NEWS_TE = "న్యూస్";              // న్యూస్

// Ordered longest-first so a shorter pattern never eats a longer one.
// NOTE: rayalaseema_express (underscore, the Postgres DB name) is intentionally
// NOT renamed here — see docker-compose.yml skip + infra/README.md ops migration.
const REPLACEMENTS = [
  ["rayalaseemaexpress.com", "rayalaseemanews.com"],
  ["rayalaseema-express",    "rayalaseema-news"],
  ["Rayalaseema Express",    "Rayalaseema News"],
  [`${RAYA} ${EXP_ZWNJ}`,    `${RAYA} ${NEWS_TE}`],
  [`${RAYA} ${EXP_NO_ZWNJ}`, `${RAYA} ${NEWS_TE}`],
];

function shouldSkipDir(absPath) {
  const name = basename(absPath);
  if (SKIP_DIRS.has(name)) return true;
  const rel = absPath.slice(ROOT.length + 1);
  return SKIP_DIR_PATHS.some(p => rel === p || rel.startsWith(p + sep));
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (shouldSkipDir(p)) continue;
      yield* walk(p);
    } else if (st.isFile()) {
      yield p;
    }
  }
}

const stats = { scanned: 0, changedFiles: 0, totalReplacements: 0, perPattern: REPLACEMENTS.map(() => 0) };
const changed = [];

for (const file of walk(ROOT)) {
  if (SKIP_FILES.has(file)) continue;
  const ext = extname(file).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) continue;
  stats.scanned++;

  let content;
  try { content = readFileSync(file, "utf8"); } catch { continue; }

  let next = content;
  let fileTouched = false;
  for (let i = 0; i < REPLACEMENTS.length; i++) {
    const [from, to] = REPLACEMENTS[i];
    if (!next.includes(from)) continue;
    const before = next;
    next = next.split(from).join(to);
    const n = (before.length - next.length) / (from.length - to.length || 1);
    stats.perPattern[i] += n;
    stats.totalReplacements += n;
    fileTouched = true;
  }
  if (fileTouched) {
    stats.changedFiles++;
    changed.push(file.slice(ROOT.length + 1));
    if (APPLY) writeFileSync(file, next, "utf8");
  }
}

console.log(`Mode:      ${APPLY ? "APPLY (wrote files)" : "DRY-RUN (no writes)"}`);
console.log(`Scanned:   ${stats.scanned} files`);
console.log(`Touched:   ${stats.changedFiles} files`);
console.log(`Total replacements: ${stats.totalReplacements}`);
for (let i = 0; i < REPLACEMENTS.length; i++) {
  console.log(`  ${stats.perPattern[i].toString().padStart(5)}  ${REPLACEMENTS[i][0]} -> ${REPLACEMENTS[i][1]}`);
}
console.log("");
console.log("Touched files:");
for (const f of changed) console.log("  " + f);
