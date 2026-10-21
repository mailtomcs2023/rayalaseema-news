import { describe, test, expect } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { renderPressCardPdf, PressCardRenderError } from "../src/lib/press-card/render";

const RUN = process.env.PRESS_CARD_RENDER_TEST === "1";
const card = {
  cardNo: "RSN/2026/001", token: "a3dmykc2k3q7", name: "G. Srinivas Reddy", designation: "Chief Editor",
  photoUrl: "https://rayalaseemamedia.blob.core.windows.net/uploads/press-cards/RSN-2026-001.jpg",
  validFrom: new Date("2026-10-06T00:00:00Z"), validTill: new Date("2027-10-05T00:00:00Z"),
};

describe.skipIf(!RUN)("renderPressCardPdf (needs Chromium + network)", () => {
  test("produces a 2-page PDF", async () => {
    const pdf = await renderPressCardPdf(card);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
  }, 60_000);
  test("unreachable photo -> PHOTO_UNREACHABLE", async () => {
    await expect(renderPressCardPdf({ ...card, photoUrl: "https://rayalaseemamedia.blob.core.windows.net/uploads/press-cards/does-not-exist.jpg" }))
      .rejects.toBeInstanceOf(PressCardRenderError);
  }, 60_000);
});
