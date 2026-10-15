import { describe, test, expect } from "bun:test";
import { renderCardHtml, verifyUrlFor, fmtDay } from "../src/lib/press-card/template";

const card = {
  cardNo: "RSN/2026/001", token: "a3dmykc2k3q7", name: "G. Srinivas Reddy", designation: "Chief Editor",
  photoUrl: "https://example.com/p.jpg", validFrom: new Date("2026-10-06T00:00:00Z"), validTill: new Date("2027-10-05T00:00:00Z"),
};
const assets = { lockupDataUri: "data:image/png;base64,AAA", mainLogoDataUri: "data:image/png;base64,BBB", qrDataUri: "data:image/png;base64,CCC" };

describe("press-card template", () => {
  test("verify url", () => {
    expect(verifyUrlFor("a3dmykc2k3q7")).toBe("https://rayalaseemanews.com/verify/a3dmykc2k3q7");
  });
  test("fmtDay is DD-MM-YYYY in UTC", () => {
    expect(fmtDay(new Date("2027-10-05T00:00:00Z"))).toBe("05-10-2027");
  });
  test("front contains name, designation, card no, dates, photo, PRESS band, no Telugu", () => {
    const html = renderCardHtml("front", card, assets);
    for (const s of ["G. Srinivas Reddy", "Chief Editor", "RSN/2026/001", "06-10-2026", "05-10-2027", "https://example.com/p.jpg", ">PRESS<", "@page { size: 60mm 91.6mm"]) expect(html).toContain(s);
    expect(/[ఀ-౿]/.test(html)).toBe(false);
  });
  test("back contains CIN, QR, card no, company phone, no personal phone", () => {
    const html = renderCardHtml("back", card, assets);
    for (const s of ["U58130AP2026PTC127049", "data:image/png;base64,CCC", "RSN/2026/001", "9390375460", "Scan to verify"]) expect(html).toContain(s);
    expect(html).not.toContain("8884575460");
  });
  test("escapes HTML in user-controlled fields", () => {
    const html = renderCardHtml("front", { ...card, name: "<img src=x onerror=alert(1)>" }, assets);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});
