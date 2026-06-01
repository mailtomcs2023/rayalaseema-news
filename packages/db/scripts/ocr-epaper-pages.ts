// OCR worker for legacy/uploaded ePaper PDFs.
//
// Walks every EpaperPage where ocrText IS NULL (or older than the PDF's
// updatedAt), pulls the page PDF via pdfUrl, rasterizes each page to PNG via
// pdf-lib + sharp, then OCRs with tesseract.js using telugu + english
// traineddata.
//
// Idempotent - re-running only processes pages without ocrText.
//
// Run: bun packages/db/scripts/ocr-epaper-pages.ts
//
// Status: SCAFFOLD ONLY - full Tesseract pipeline lands in a follow-up.
// Surface the column + search wiring now so /epaper/search returns results
// for live articles immediately, while OCR for the legacy archive lands
// when the worker is enabled.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.epaperPage.findMany({
    where: { ocrText: null, pdfUrl: { not: null } },
    select: { id: true, pdfUrl: true, edition: { select: { date: true, edition: true } } },
    take: 100,
  });

  console.log(`[ocr] ${candidates.length} pages awaiting OCR`);

  if (candidates.length === 0) {
    console.log("[ocr] nothing to do - all pages already OCR'd");
    return;
  }

  console.error("[ocr] Tesseract pipeline not yet wired. Steps for follow-up:");
  console.error("  1. bun add tesseract.js sharp pdf-lib");
  console.error("  2. Download tel.traineddata + eng.traineddata into ./tessdata");
  console.error("  3. For each candidate:");
  console.error("     - fetch(pdfUrl) → PDFDocument");
  console.error("     - for each page: rasterize to PNG buffer at 200 dpi");
  console.error("     - Tesseract.recognize(png, 'tel+eng', { tessdata })");
  console.error("     - prisma.epaperPage.update({ where: { id }, data: { ocrText, ocrAt: new Date() } })");
  console.error("  4. Schedule via cron (daily 4am IST) so newly rendered pages get indexed automatically");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
