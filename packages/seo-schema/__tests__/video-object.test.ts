// Spec 12.5 (Video IQ) - transcript on VideoObject JSON-LD.
import { describe, test, expect } from "bun:test";
import { buildVideoObjectSchema } from "../src/video-object";

const base = {
  title: "t",
  description: "d",
  videoId: "abcdefghijk",
  publishedAt: "2026-10-20T00:00:00Z",
  pageUrl: "https://rayalaseemanews.com/videos/x",
  publisher: { name: "Rayalaseema News", logoUrl: "https://rayalaseemanews.com/logo.png", siteUrl: "https://rayalaseemanews.com" },
};

describe("VideoObject transcript", () => {
  test("includes transcript when given, whitespace-collapsed and trimmed to 5000 chars", () => {
    const s = buildVideoObjectSchema({ ...base, transcript: "కడపలో   దారుణం\n\n" + "అ".repeat(6000) }) as Record<string, unknown>;
    const t = s.transcript as string;
    expect(t.startsWith("కడపలో దారుణం అ")).toBe(true);
    expect([...t].length).toBe(5000);
  });
  test("omits transcript when empty or missing", () => {
    expect("transcript" in (buildVideoObjectSchema({ ...base, transcript: "" }) as object)).toBe(false);
    expect("transcript" in (buildVideoObjectSchema({ ...base, transcript: null }) as object)).toBe(false);
    expect("transcript" in (buildVideoObjectSchema(base) as object)).toBe(false);
  });
});
