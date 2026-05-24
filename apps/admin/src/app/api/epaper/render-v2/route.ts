import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { renderLayoutToHtml } from "@/lib/epaper/render-layout";
import { createSnapshot } from "@/lib/epaper/snapshots";
import { findDuplicateArticles } from "@/lib/epaper/continuity";
import { uploadBuffer } from "@/lib/blob";
import { chromium } from "playwright";
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

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR"]);
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
      return NextResponse.json({ error: "Edition has no pages — call generate-edition first" }, { status: 400 });
    }

    // Snapshot before render so the operator can rollback to the exact
    // layout that produced the previous PDF if the new render goes wrong.
    await createSnapshot(edition.id, "pre-render", { snappedById: session.user.id });

    await prisma.epaperEdition.update({ where: { id: edition.id }, data: { status: "generating" } });

    const browser = await chromium.launch();
    const masterPdf = await PDFDocument.create();

    try {
      for (const ep of edition.pages) {
        const html = await renderLayoutToHtml({
          pageNumber: ep.pageNumber,
          totalPages: edition.pages.length,
          label: ep.label,
          templateSlug: ep.templateSlug,
          dateLabel: edition.date.toLocaleDateString("te-IN", { day: "numeric", month: "long", year: "numeric" }),
          layout: (ep.layout as unknown as { blocks: Block[] }) ?? { blocks: [] },
          ads: {},
        });

        // Indian broadsheet single-page side ≈ 300×560 mm. Render at 1480×2760 px
        // (~125 dpi) so headlines stay sharp when readers zoom in.
        const page = await browser.newPage({ viewport: { width: 1480, height: 2760 } });
        await page.setContent(html, { waitUntil: "networkidle" });
        // Wait until every <img> has actually decoded (networkidle alone races on
        // Azure Blob CDN-served featured images), then a 300 ms tick for fonts.
        await page.evaluate(async () => {
          await Promise.all(
            Array.from(document.images).map((img) =>
              img.complete && img.naturalHeight !== 0
                ? Promise.resolve()
                : new Promise<void>((resolve) => {
                    img.addEventListener("load", () => resolve(), { once: true });
                    img.addEventListener("error", () => resolve(), { once: true });
                  })
            )
          );
          if ((document as any).fonts?.ready) await (document as any).fonts.ready;
        });
        await page.waitForTimeout(300);
        const pdfBytes = await page.pdf({
          width: "300mm",
          height: "560mm",
          printBackground: true,
          preferCSSPageSize: false,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });

        // Also capture a PNG. The web ePaper viewer renders this directly as
        // <img>; the PDF is the download/print artifact. Saving both gives us
        // instant on-screen pages plus crisp print output.
        const pngBytes = await page.screenshot({ type: "png", fullPage: false });
        await page.close();

        // Upload per-page PDF + PNG artifacts.
        const pageUrl = await uploadBuffer(Buffer.from(pdfBytes), "pdf", "application/pdf");
        const imageUrl = await uploadBuffer(Buffer.from(pngBytes), "png", "image/png");
        await prisma.epaperPage.update({
          where: { id: ep.id },
          data: { pdfUrl: pageUrl, imageUrl },
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

    // Quality gate: any article appearing on >1 non-continuation block?
    // Reported alongside the PDF — operator may want to fix and re-render.
    const duplicates = await findDuplicateArticles(edition.id);

    return NextResponse.json({
      editionId: edition.id,
      pdfUrl: finalUrl,
      pageCount: edition.pages.length,
      duplicates,
    });
  } catch (e) {
    return apiError(e);
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
