import { prisma } from "@rayalaseema/db";
import { renderEpaperPageById } from "../src/lib/epaper/render-layout";
import { chromium } from "playwright";

async function main() {
  const p = await prisma.epaperPage.findFirst({ where: { templateSlug: "front" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  const html = await renderEpaperPageById(p!.id);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1480, height: 2760 } });
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete), { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);

  const info = await page.$$eval(".lead.block, .major.block, .secondary.block", (els) =>
    els.slice(0, 3).map((el) => {
      const r = el.getBoundingClientRect();
      const dek = el.querySelector(".lead-dek, .maj-dek, .sec-dek") as HTMLElement | null;
      const hl = el.querySelector(".lead-hl, .maj-hl, .sec-hl") as HTMLElement | null;
      const img = el.querySelector("img") as HTMLImageElement | null;
      const csHl = hl ? getComputedStyle(hl) : null;
      const csDek = dek ? getComputedStyle(dek) : null;
      const a = el.querySelector("a.story-link");
      const csA = a ? getComputedStyle(a) : null;
      return {
        cls: el.className,
        box: { y: Math.round(r.y), h: Math.round(r.height) },
        aColor: csA?.color, aVis: csA?.visibility, aOpacity: csA?.opacity,
        hlColor: csHl?.color, hlVis: csHl?.visibility, hlOpacity: csHl?.opacity, hlFont: csHl?.fontFamily,
        dekColor: csDek?.color,
        img: img ? { complete: img.complete, nat: `${img.naturalWidth}x${img.naturalHeight}`, src: img.src.slice(0, 60) } : null,
      };
    })
  );
  console.log(JSON.stringify(info, null, 2));

  // Ground truth: clip the FULL-PAGE screenshot to the lead's box.
  await page.screenshot({ path: "c:/tmp/lead-clip.png", clip: { x: 0, y: 624, width: 982, height: 1236 } });
  // Also: force a visible marker on headline/dek to confirm paint location.
  // Proposed minimal fix: drop the percentage-height clip chain; let .block
  // (definite grid-track height + overflow:hidden) be the single clipper.
  await page.addStyleTag({ content: `
    .block a.story-link{height:auto !important}
    .block .block-inner{height:auto !important}
  ` });
  await page.screenshot({ path: "c:/tmp/lead-fullmarked.png", fullPage: false });
  await browser.close();
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
