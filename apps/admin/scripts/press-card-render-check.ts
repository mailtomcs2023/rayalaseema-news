// Node-runnable happy-path check for renderPressCardPdf. bun:test cannot
// launch Playwright's Chromium via its CDP pipe on this machine (see
// press-card-render.test.ts), but the renderer itself works fine under
// plain Node/tsx. Run with:
//   cd apps/admin && bunx tsx scripts/press-card-render-check.ts [outPath]
import { PDFDocument } from "pdf-lib";
import { renderPressCardPdf } from "../src/lib/press-card/render";

const outPath = process.argv[2] || "./press-card-render-check.pdf";

const card = {
  cardNo: "RSN/2026/001",
  token: "a3dmykc2k3q7",
  name: "G. Srinivas Reddy",
  designation: "Chief Editor",
  photoUrl: "https://rayalaseemamedia.blob.core.windows.net/uploads/press-cards/RSN-2026-001.jpg",
  validFrom: new Date("2026-10-06T00:00:00Z"),
  validTill: new Date("2027-10-05T00:00:00Z"),
};

async function main() {
  const pdf = await renderPressCardPdf(card);
  const doc = await PDFDocument.load(pdf);
  const pageCount = doc.getPageCount();
  const fs = await import("node:fs/promises");
  await fs.writeFile(outPath, pdf);
  console.log(`wrote ${outPath}: ${pdf.length} bytes, ${pageCount} pages`);
  if (pageCount !== 2) {
    console.error(`expected 2 pages, got ${pageCount}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
