// TEMP end-to-end harness (not shipped). Generates ONE real edition for a date
// the exact way /api/epaper/generate-edition does (real autofill + real
// templates + continuations), then renders every page locally to c:\tmp\edition
// with the same settle + hotspot-harvest logic as /api/epaper/render-v2.
// No auth, no Azure blob.
//
//   bunx tsx apps/admin/scripts/_verify-epaper-edition.ts [YYYY-MM-DD]
import { prisma } from "@rayalaseema/db";
import { autofillTemplate, type BlockSlot } from "../src/lib/epaper/autofill";
import { buildContinuations } from "../src/lib/epaper/continuation";
import { renderEpaperPageById } from "../src/lib/epaper/render-layout";
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "c:/tmp/edition";
fs.mkdirSync(OUT, { recursive: true });
const LOG = "c:/tmp/edition/edition.log";
fs.writeFileSync(LOG, "");
const log = (m: string) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${m}\n`; fs.appendFileSync(LOG, l); process.stdout.write(l); };

async function main() {
  const dateStr = process.argv[2] || new Date().toISOString().slice(0, 10);
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  log(`=== generate edition for ${dateStr} ===`);

  const tplCount = await prisma.epaperTemplate.count({ where: { active: true } });
  const artCount = await prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED" } });
  log(`active templates=${tplCount}  publishedArticles=${artCount}`);
  if (tplCount === 0) { log("FATAL: no templates seeded locally - run seed-epaper-templates.ts"); await prisma.$disconnect(); process.exit(2); }

  // ---- replicate generate-edition ----
  const templates = await prisma.epaperTemplate.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const edition = await prisma.epaperEdition.upsert({
    where: { date_edition: { date, edition: "main" } },
    update: { status: "draft", pageCount: templates.length },
    create: { date, edition: "main", status: "draft", pageCount: templates.length, title: `${dateStr} Edition` },
  });
  await prisma.epaperPage.deleteMany({ where: { editionId: edition.id } });

  const MIN_FILL_PER_PAGE = 3;
  const used = new Set<string>();
  let pageNumber = 0;
  let skipped = 0;
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    const layout = t.layout as unknown as { blocks: BlockSlot[] };
    const result = await autofillTemplate({
      templateSlug: t.slug,
      templateLayout: layout,
      templateRules: (t.fillRules as Record<string, unknown> | null) ?? undefined,
      excludeArticleIds: used,
    });
    if (t.slug !== "front" && result.filledCount < MIN_FILL_PER_PAGE) { skipped++; continue; }
    for (const id of result.usedArticleIds) used.add(id);
    pageNumber++;
    await prisma.epaperPage.create({
      data: { editionId: edition.id, pageNumber, label: t.defaultLabel || t.name, templateSlug: t.slug, layout: { blocks: result.blocks } as any, imageUrl: "" },
    });
    log(`page ${String(pageNumber).padStart(2, "0")} ${t.slug.padEnd(22)} filled=${result.filledCount} unfilled=${result.unfilledSlotIds.length}`);
  }
  log(`pruned ${skipped} empty/near-empty templates (min fill ${MIN_FILL_PER_PAGE})`);
  const cont = await buildContinuations(edition.id);
  log(`continuations created: ${cont}  | distinct articles used: ${used.size}`);

  // ---- render every page locally ----
  const pages = await prisma.epaperPage.findMany({ where: { editionId: edition.id }, orderBy: { pageNumber: "asc" }, select: { id: true, pageNumber: true, label: true, templateSlug: true, layout: true } });
  const browser = await chromium.launch();
  let totalHotspots = 0;
  try {
    for (const ep of pages) {
      const coordSystem = (ep.layout as { coordSystem?: string } | null)?.coordSystem === "mm-v2" ? "mm-v2" : "grid-v1";
      const viewport = coordSystem === "mm-v2" ? { width: 1875, height: 2843 } : { width: 1480, height: 2760 };
      const html = await renderEpaperPageById(ep.id);
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(20000);
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      // Simple anonymous predicate only - no named helpers (keepNames → __name).
      await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete), { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(700);
      const hotspots = await page.$$eval("a.story-link", (els, dims) =>
        els.map((el) => { const r = el.getBoundingClientRect(); const raw = el.getAttribute("href") || ""; let href = raw; try { href = new URL(raw, "http://x").pathname; } catch {} const slug = href.split("/").filter(Boolean).pop() || ""; return { slug, href, x: +(r.x / dims.w).toFixed(4), y: +(r.y / dims.h).toFixed(4), w: +(r.width / dims.w).toFixed(4), h: +(r.height / dims.h).toFixed(4) }; }).filter((b) => b.slug && b.w > 0 && b.h > 0 && b.x >= 0 && b.y >= 0),
        { w: viewport.width, h: viewport.height });
      totalHotspots += hotspots.length;
      await page.screenshot({ path: `${OUT}/page-${String(ep.pageNumber).padStart(2, "0")}.png` });
      await page.close();
      log(`rendered page ${String(ep.pageNumber).padStart(2, "0")} ${ep.templateSlug?.padEnd(22)} hotspots=${hotspots.length}`);
    }
  } finally { await browser.close(); }

  await prisma.$disconnect();
  log(`=== DONE: ${pages.length} pages, ${totalHotspots} hotspots total → ${OUT} ===`);
}

main().catch((e) => { log("ERROR: " + (e?.stack || e?.message || String(e))); process.exit(1); });
