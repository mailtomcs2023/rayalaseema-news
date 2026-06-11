// TEMP verification harness (not shipped). Proves the e-paper click-through
// chain end-to-end against the LOCAL DB, using the real render-layout module
// and the exact hotspot-harvest logic from /api/epaper/render-v2 - no auth,
// no Azure blob. Logs synchronously to c:\tmp\verify.log (stdout is block-
// buffered when piped, so we can't rely on it).
//
//   bunx tsx apps/admin/scripts/_verify-epaper-render.ts
import { prisma } from "@rayalaseema/db";
import { renderEpaperPageById, renderLayoutToHtml } from "../src/lib/epaper/render-layout";
import { chromium } from "playwright";
import fs from "node:fs";

const OUT = "c:/tmp";
fs.mkdirSync(OUT, { recursive: true });
const LOG = `${OUT}/verify.log`;
fs.writeFileSync(LOG, "");
const log = (m: string) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${m}\n`; fs.appendFileSync(LOG, line); process.stdout.write(line); };

async function harvest(page: import("playwright").Page, vw: number, vh: number) {
  return page.$$eval(
    "a.story-link",
    (els, dims) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const raw = el.getAttribute("href") || "";
        let href = raw; try { href = new URL(raw, "http://x").pathname; } catch { /* keep */ }
        const slug = href.split("/").filter(Boolean).pop() || "";
        return { slug, href, x: +(r.x / dims.w).toFixed(4), y: +(r.y / dims.h).toFixed(4), w: +(r.width / dims.w).toFixed(4), h: +(r.height / dims.h).toFixed(4) };
      }).filter((b) => b.slug && b.w > 0 && b.h > 0 && b.x >= 0 && b.y >= 0),
    { w: vw, h: vh }
  );
}

async function main() {
  log("START");
  const [edCount, pgCount, artCount] = await Promise.all([
    prisma.epaperEdition.count(),
    prisma.epaperPage.count(),
    prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED" } }),
  ]);
  log(`db: editions=${edCount} pages=${pgCount} publishedArticles=${artCount}`);

  const pages = await prisma.epaperPage.findMany({ select: { id: true, pageNumber: true, label: true, layout: true }, orderBy: { pageNumber: "asc" } });
  const realPage = pages.find((p) => ((p.layout as { blocks?: { articleId?: string }[] } | null)?.blocks || []).some((b) => b.articleId));

  let html: string;
  let coordSystem: "grid-v1" | "mm-v2";

  if (realPage) {
    coordSystem = (realPage.layout as { coordSystem?: string } | null)?.coordSystem === "mm-v2" ? "mm-v2" : "grid-v1";
    log(`render: REAL page #${realPage.pageNumber} "${realPage.label}" coord=${coordSystem}`);
    html = await renderEpaperPageById(realPage.id);
  } else {
    const arts = await prisma.content.findMany({
      where: { type: "ARTICLE", status: "PUBLISHED", featuredImage: { not: null } },
      orderBy: { publishedAt: "desc" }, take: 6,
      select: { id: true, title: true, category: { select: { slug: true } }, constituency: { select: { slug: true } } },
    });
    log(`render: no real page; synthesizing from ${arts.length} articles`);
    arts.forEach((a) => log(`   art: ${a.title?.slice(0, 44)} [cat=${a.category?.slug} con=${a.constituency?.slug}]`));
    if (arts.length < 3) { log("FATAL: <3 articles"); await prisma.$disconnect(); process.exit(2); }
    coordSystem = "mm-v2";
    html = await renderLayoutToHtml({
      pageNumber: 1, totalPages: 1, label: "ముఖ్యాంశాలు", templateSlug: "front", dateLabel: "9 జూన్ 2026",
      // @ts-expect-error coordSystem read at runtime
      layout: { coordSystem: "mm-v2", blocks: [
        { id: "mast", type: "masthead", x: 0, y: 0, w: 381, h: 70 },
        { id: "lead", type: "lead", x: 8, y: 80, w: 240, h: 230, articleId: arts[0].id },
        { id: "maj1", type: "major", x: 256, y: 80, w: 117, h: 230, articleId: arts[1].id },
        { id: "sec1", type: "secondary", x: 8, y: 320, w: 120, h: 180, articleId: arts[2].id },
        { id: "sec2", type: "secondary", x: 134, y: 320, w: 120, h: 180, articleId: arts[3 % arts.length].id },
        { id: "sec3", type: "secondary", x: 260, y: 320, w: 113, h: 180, articleId: arts[4 % arts.length].id },
      ] },
    });
  }
  log(`html ready: ${html.length} bytes`);

  const viewport = coordSystem === "mm-v2" ? { width: 1875, height: 2843 } : { width: 1480, height: 2760 };
  log("launching chromium…");
  const browser = await chromium.launch();
  log("chromium launched");
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(20000);
  log("setContent (domcontentloaded)…");
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  log("content set; settling images/fonts…");
  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images).map((img) => img.complete && img.naturalHeight !== 0 ? Promise.resolve()
      : new Promise<void>((res) => { const t = setTimeout(() => res(), 8000); img.addEventListener("load", () => { clearTimeout(t); res(); }, { once: true }); img.addEventListener("error", () => { clearTimeout(t); res(); }, { once: true }); })));
    if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]);
  });
  await page.waitForTimeout(400);
  log("settled; harvesting hotspots…");

  const hotspots = await harvest(page, viewport.width, viewport.height);
  log(`HOTSPOTS: ${hotspots.length}`);
  hotspots.forEach((h) => log(`  • ${h.href}  @ x=${h.x} y=${h.y} w=${h.w} h=${h.h}`));

  await page.screenshot({ path: `${OUT}/epaper-page.png` });
  log("wrote epaper-page.png");
  await page.addStyleTag({ content: `
    a.story-link { outline: 4px solid rgba(224,27,27,0.95) !important; outline-offset: -2px; }
    a.story-link::after { content: attr(href); position: absolute; top: 0; left: 0; background: #E01B1B; color: #fff; font: 700 14px sans-serif; padding: 1px 6px; z-index: 9999; max-width: 100%; overflow: hidden; white-space: nowrap; }
  ` });
  await page.screenshot({ path: `${OUT}/epaper-hotspots.png` });
  log("wrote epaper-hotspots.png");

  await browser.close();
  await prisma.$disconnect();
  log(`VERDICT: ${hotspots.length > 0 ? "PASS" : "FAIL"}`);
}

main().catch((e) => { log("ERROR: " + (e?.stack || e?.message || String(e))); process.exit(1); });
