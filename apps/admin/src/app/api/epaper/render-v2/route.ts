import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { renderEpaperPageById } from "@/lib/epaper/render-layout";
import { createSnapshot } from "@/lib/epaper/snapshots";
import { findDuplicateArticles } from "@/lib/epaper/continuity";
import { findQualityWarnings } from "@/lib/epaper/quality";
import { uploadBuffer } from "@/lib/blob";
import { chromium } from "playwright";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFArray, PDFDict, type PDFRef } from "pdf-lib";

// POST /api/epaper/render-v2
// Body: { editionId }
//
// v2 render path. Replaces /api/epaper/render (raster screenshot → PDF).
//
// For each page of the edition we:
//   1. Generate HTML from the layout JSON via renderLayoutToHtml
//   2. Use Playwright `page.pdf()` to produce a *vector* per-page PDF
//      (real text, selectable, hyperlinks honored as link annotations)
//   3. Merge all per-page PDFs with pdf-lib into one edition PDF
//   4. Rewrite "#page=N" link annotations as internal goto-page references
//      so cross-page article continuations work in any reader
//
// Outputs to Azure Blob; updates EpaperEdition.pdfUrl + each EpaperPage.pdfUrl.

export const maxDuration = 300;

interface Block { id: string; type: string; targetPage?: number }

// Maximum render attempts before surfacing the failure to the operator.
// Each attempt re-launches Chromium from scratch - most transient errors
// (font load races, image fetch timeouts) clear on retry.
const MAX_RENDER_ATTEMPTS = 3;

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const editionId = body?.editionId as string;
    if (!editionId) return NextResponse.json({ error: "editionId required" }, { status: 400 });

    const edition = await prisma.epaperEdition.findUnique({
      where: { id: editionId },
      include: {
        pages: { orderBy: { pageNumber: "asc" } },
      },
    });
    if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
    if (edition.pages.length === 0) {
      return NextResponse.json({ error: "Edition has no pages - call generate-edition first" }, { status: 400 });
    }

    // Snapshot before render so the operator can rollback to the exact
    // layout that produced the previous PDF if the new render goes wrong.
    await createSnapshot(edition.id, "pre-render", { snappedById: session.user.id });

    await prisma.epaperEdition.update({ where: { id: edition.id }, data: { status: "generating" } });

    // Render-job row tracks attempts, duration, outcome - powers the SLA
    // dashboard (#90). One row per POST, retries increment in-place.
    const job = await prisma.epaperRenderJob.create({
      data: {
        editionId: edition.id,
        triggeredById: session.user.id,
        status: "running",
        startedAt: new Date(),
        pageCount: edition.pages.length,
      },
    });
    const tStart = Date.now();
    let attempt = 0;
    let lastError: unknown = null;

    // Retry loop: on Playwright crash or image-fetch timeout, re-launch
    // Chromium fresh and try again up to MAX_RENDER_ATTEMPTS.
    while (attempt < MAX_RENDER_ATTEMPTS) {
      attempt++;
      try {
        return await renderEditionAttempt(edition, session, job.id, tStart, attempt);
      } catch (err) {
        lastError = err;
        await prisma.epaperRenderJob.update({
          where: { id: job.id },
          data: { retries: attempt, lastError: String((err as Error)?.message || err).slice(0, 500) },
        });
        if (attempt >= MAX_RENDER_ATTEMPTS) break;
        // Brief back-off before retry; let Azure Blob / font CDN settle.
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // All attempts exhausted - mark failed.
    await prisma.epaperRenderJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        durationMs: Date.now() - tStart,
        retries: attempt,
        lastError: String((lastError as Error)?.message || lastError).slice(0, 500),
      },
    });
    await prisma.epaperEdition.update({ where: { id: edition.id }, data: { status: "failed" } });
    return apiError(lastError);
  } catch (e) {
    return apiError(e);
  }
}

async function renderEditionAttempt(
  edition: { id: string; date: Date; pages: Array<{ id: string; pageNumber: number; label: string; templateSlug: string | null; layout: unknown }> },
  session: { user: { id: string } },
  jobId: string,
  tStart: number,
  attempt: number,
): Promise<NextResponse> {
  try {

    const browser = await chromium.launch();
    const masterPdf = await PDFDocument.create();

    try {
      for (const ep of edition.pages) {
        // Use the same render path as the preview iframe so the rendered PDF
        // matches what the editor shows. renderEpaperPageById loads the
        // legacy + v2 ad assets + masthead bibliographic info from DB.
        const html = await renderEpaperPageById(ep.id);
        const coordSystem: "grid-v1" | "mm-v2" =
          (ep.layout as any)?.coordSystem === "mm-v2" ? "mm-v2" : "grid-v1";
        // v2 (mm-v2): real Indian broadsheet trim 381×578mm at ~125 dpi → 1875×2843 px.
        // v1 (grid-v1): legacy 300×560mm → 1480×2760 px (kept for back-compat).
        const viewport = coordSystem === "mm-v2"
          ? { width: 1875, height: 2843 }
          : { width: 1480, height: 2760 };
        const pdfDims = coordSystem === "mm-v2"
          ? { width: "381mm", height: "578mm" }
          : { width: "300mm", height: "560mm" };

        // viewport + pdfDims chosen above based on coordSystem (mm-v2 uses
        // the Eenadu trim 381×578mm; grid-v1 keeps the legacy size for
        // bit-identical re-renders of the published archive).
        const page = await browser.newPage({ viewport });
        // NOTE: do NOT use waitUntil:"networkidle" here - the Google Fonts CDN
        // (<link> in the rendered HTML) can keep a connection alive and stall
        // networkidle for the full navigation timeout, hanging the whole render.
        // domcontentloaded + the explicit per-image/font settle below is both
        // faster and deterministic.
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        // Wait until every <img> has actually decoded, then for fonts. Each
        // wait is capped so a single slow/broken asset can't stall the render.
        // All callbacks below are anonymous arrows on purpose: a named helper
        // (e.g. `const withTimeout = ...`) gets wrapped by the bundler's
        // keepNames transform into `__name(...)`, which is undefined in the
        // page context and throws "ReferenceError: __name is not defined".
        await page.evaluate(async () => {
          await Promise.all(
            Array.from(document.images).map((img) =>
              img.complete && img.naturalHeight !== 0
                ? Promise.resolve()
                : Promise.race([
                    new Promise<void>((resolve) => {
                      img.addEventListener("load", () => resolve(), { once: true });
                      img.addEventListener("error", () => resolve(), { once: true });
                    }),
                    new Promise<void>((resolve) => setTimeout(resolve, 8000)),
                  ])
            )
          );
          if ((document as any).fonts?.ready) {
            await Promise.race([(document as any).fonts.ready, new Promise((r) => setTimeout(r, 5000))]);
          }
        });
        await page.waitForTimeout(300);

        // Harvest clickable article hotspots from the rendered DOM. The layout
        // renderer wraps every story in <a class="story-link" href="...">; we
        // read each anchor's box, normalize to fractional page coords (the web
        // viewer positions hotspots as % of the page image, which is captured
        // at this exact viewport), and store the canonical href + slug. Without
        // this the public viewer shows pages but no tappable articles.
        const hotspots = await page.$$eval(
          "a.story-link",
          (els, dims) =>
            els
              .map((el) => {
                const r = el.getBoundingClientRect();
                const raw = el.getAttribute("href") || "";
                // Strip origin → relative /telugu-news/... path; derive slug
                // from the last path segment for analytics.
                let href = raw;
                try { href = new URL(raw, "http://x").pathname; } catch { /* keep raw */ }
                const slug = href.split("/").filter(Boolean).pop() || "";
                return {
                  slug,
                  href,
                  x: +(r.x / dims.w).toFixed(4),
                  y: +(r.y / dims.h).toFixed(4),
                  w: +(r.width / dims.w).toFixed(4),
                  h: +(r.height / dims.h).toFixed(4),
                };
              })
              .filter((b) => b.slug && b.w > 0 && b.h > 0 && b.x >= 0 && b.y >= 0),
          { w: viewport.width, h: viewport.height }
        );

        const pdfBytes = await page.pdf({
          width: pdfDims.width,
          height: pdfDims.height,
          printBackground: true,
          // Honor the @page CSS declaration so we get one PDF page per
          // edition page (no off-by-padding overflow into a 2nd sheet).
          preferCSSPageSize: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });

        // Capture the on-screen page image for the web viewer (the PDF is the
        // download/print artifact). Convert PNG → WebP: a full broadsheet page
        // is ~300-500KB as PNG but ~60-120KB as WebP q86, with no visible loss
        // of text crispness - a big win for mobile viewer load time. Hotspots
        // are fractional coords, so the image format/resolution doesn't matter.
        const pngBytes = await page.screenshot({ type: "png", fullPage: false });
        await page.close();
        const webpBytes = await sharp(pngBytes).webp({ quality: 86 }).toBuffer();

        // Upload per-page PDF + WebP artifacts.
        const pageUrl = await uploadBuffer(Buffer.from(pdfBytes), "pdf", "application/pdf");
        const imageUrl = await uploadBuffer(Buffer.from(webpBytes), "webp", "image/webp");
        await prisma.epaperPage.update({
          where: { id: ep.id },
          data: { pdfUrl: pageUrl, imageUrl, hotspots },
        });

        const merged = await PDFDocument.load(pdfBytes);
        const copied = await masterPdf.copyPages(merged, merged.getPageIndices());
        for (const p of copied) masterPdf.addPage(p);
      }
    } finally {
      await browser.close();
    }

    // Post-process: rewrite "#page=N" URI link annotations to internal goto-page actions.
    rewriteInternalLinks(masterPdf);

    const finalBytes = await masterPdf.save();
    const finalUrl = await uploadBuffer(Buffer.from(finalBytes), "pdf", "application/pdf");

    await prisma.epaperEdition.update({
      where: { id: edition.id },
      data: { pdfUrl: finalUrl, status: "ready", pageCount: edition.pages.length },
    });

    // Mark render-job succeeded with duration + artifact size for the SLA log.
    await prisma.epaperRenderJob.update({
      where: { id: jobId },
      data: {
        status: "succeeded",
        completedAt: new Date(),
        durationMs: Date.now() - tStart,
        retries: attempt - 1,
        pdfSizeBytes: finalBytes.byteLength,
      },
    });

    // Quality gates: duplicate articles + spell-check-lite warnings.
    const [duplicates, qualityWarnings] = await Promise.all([
      findDuplicateArticles(edition.id),
      findQualityWarnings(edition.id),
    ]);

    return NextResponse.json({
      editionId: edition.id,
      pdfUrl: finalUrl,
      pageCount: edition.pages.length,
      duplicates,
      qualityWarnings,
      job: { id: jobId, attempt, durationMs: Date.now() - tStart },
    });
  } catch (e) {
    // Re-throw - outer retry loop in POST handles retry + final failure logging.
    throw e;
  }
}

/**
 * Walks every page's annotations and rewrites URI-style "#page=N" hrefs into
 * native PDF goto-page actions. Most readers honor a bare `#page=N` in a URI
 * annotation, but converting to a true GoTo action makes cross-page jumps
 * reliable in stricter readers (Acrobat, mobile viewers).
 */
function rewriteInternalLinks(pdf: PDFDocument) {
  const pages = pdf.getPages();
  for (const page of pages) {
    const annotsRaw = page.node.lookup(PDFName.of("Annots"));
    if (!(annotsRaw instanceof PDFArray)) continue;
    for (let i = 0; i < annotsRaw.size(); i++) {
      const item = annotsRaw.lookup(i);
      if (!(item instanceof PDFDict)) continue;
      const subtype = item.lookup(PDFName.of("Subtype"));
      if (subtype?.toString() !== "/Link") continue;
      const action = item.lookup(PDFName.of("A"));
      if (!(action instanceof PDFDict)) continue;
      const uri = action.lookup(PDFName.of("URI"));
      if (!uri) continue;
      const uriStr = uri.toString().replace(/^\(|\)$/g, "");
      const match = /^#page=(\d+)$/.exec(uriStr);
      if (!match) continue;
      const targetIdx = parseInt(match[1], 10) - 1;
      if (targetIdx < 0 || targetIdx >= pages.length) continue;
      const targetPageRef: PDFRef = pages[targetIdx].ref;

      // Replace URI action with GoTo action: /A << /S /GoTo /D [pageRef /Fit] >>
      const gotoAction = pdf.context.obj({
        S: PDFName.of("GoTo"),
        D: [targetPageRef, PDFName.of("Fit")],
      });
      item.set(PDFName.of("A"), gotoAction);
    }
  }
}
