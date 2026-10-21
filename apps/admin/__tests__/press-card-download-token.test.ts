import { describe, test, expect } from "bun:test";
import { createDownloadToken, verifyDownloadToken } from "../src/lib/press-card/download-token";

describe("download token", () => {
  test("round-trips within 10 minutes", () => {
    const t0 = 1_800_000_000_000;
    const tok = createDownloadToken("card1", t0);
    expect(verifyDownloadToken(tok, t0 + 5 * 60_000)).toBe("card1");
  });
  test("expires after 10 minutes", () => {
    const t0 = 1_800_000_000_000;
    expect(verifyDownloadToken(createDownloadToken("card1", t0), t0 + 11 * 60_000)).toBeNull();
  });
  test("tamper -> null", () => {
    const tok = createDownloadToken("card1");
    expect(verifyDownloadToken(tok.slice(0, -2) + "zz")).toBeNull();
    expect(verifyDownloadToken("")).toBeNull();
  });
});
