import { describe, test, expect } from "bun:test";
import { runInputSchema, youtubeIdFrom, visibilityToStatus, articlePayloadFrom, descriptionWithArticleLink, runSummary } from "../../src/lib/video-iq/studio";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

const future = new Date(Date.now() + 3600_000).toISOString();
const blob = { source: "blob", blobUrl: "https://rayalaseemamedia.blob.core.windows.net/uploads/videos/a.mp4", deskTitle: "ప్రొద్దుటూరులో దాడి" };

describe("runInputSchema", () => {
  test("accepts a blob upload with defaults", () => {
    const r = runInputSchema.safeParse(blob);
    expect(r.success).toBe(true);
    expect(r.success && r.data.visibility).toBe("public");
    expect(r.success && r.data.breaking).toBe(false);
  });
  test("blob source needs a blob-storage url", () => {
    expect(runInputSchema.safeParse({ ...blob, blobUrl: "https://example.com/a.mp4" }).success).toBe(false);
  });
  test("youtube source needs a parsable id and allows an empty desk title", () => {
    expect(runInputSchema.safeParse({ source: "youtube", videoUrl: "https://youtu.be/abcdefghijk", deskTitle: "" }).success).toBe(true);
    expect(runInputSchema.safeParse({ source: "youtube", videoUrl: "not a video", deskTitle: "x" }).success).toBe(false);
  });
  test("scheduled needs a future publishAt (Review Focus 1)", () => {
    expect(runInputSchema.safeParse({ ...blob, visibility: "scheduled" }).success).toBe(false);
    expect(runInputSchema.safeParse({ ...blob, visibility: "scheduled", publishAt: new Date(Date.now() - 60_000).toISOString() }).success).toBe(false);
    expect(runInputSchema.safeParse({ ...blob, visibility: "scheduled", publishAt: future }).success).toBe(true);
  });
});

describe("youtubeIdFrom", () => {
  test("parses watch, short, shorts, embed urls and bare ids", () => {
    for (const u of ["https://www.youtube.com/watch?v=abcdefghijk&t=5", "https://youtu.be/abcdefghijk", "https://youtube.com/shorts/abcdefghijk", "https://www.youtube.com/embed/abcdefghijk", "abcdefghijk"]) {
      expect(youtubeIdFrom(u)).toBe("abcdefghijk");
    }
    expect(youtubeIdFrom("https://example.com")).toBeNull();
  });
});

describe("visibilityToStatus", () => {
  test("public, private and scheduled map to YouTube status", () => {
    expect(visibilityToStatus({ visibility: "public" }).privacyStatus).toBe("public");
    expect(visibilityToStatus({ visibility: "private" }).privacyStatus).toBe("private");
    const s = visibilityToStatus({ visibility: "scheduled", publishAt: new Date(future) });
    expect(s.privacyStatus).toBe("private");
    expect(s.publishAt).toBe(new Date(future).toISOString());
    expect(s.selfDeclaredMadeForKids).toBe(false);
  });
});

describe("articlePayloadFrom", () => {
  const run: any = { id: "r1", videoId: "abcdefghijk", deskTitle: "డెస్క్ టైటిల్", breaking: true, durationSec: 274, transcript: { segments: [{ text: "ఒకటి" }, { text: "రెండు" }] }, suggestions: SAMPLE, chosen: { title: "వరదరాజుల రెడ్డిపై రాచమల్లు ఫైర్ | Rachamallu vs Varadarajulu", thumbnailUrl: "https://blob/t.jpg" } };
  test("builds a DRAFT video article from the run", () => {
    const a = articlePayloadFrom(run);
    expect(a.title).toBe("వరదరాజుల రెడ్డిపై రాచమల్లు ఫైర్");
    expect(a.summary).toBe(SAMPLE.summary_te);
    expect(a.payload).toEqual({ videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", videoId: "abcdefghijk", thumbnailUrl: "https://blob/t.jpg", transcript: "ఒకటి రెండు", duration: 274 });
    expect(a.breaking).toBe(true);
    expect(a.editorNote).toContain("r1");
  });
  test("falls back to the desk title when nothing was chosen", () => {
    const a = articlePayloadFrom({ ...run, chosen: null, suggestions: null });
    expect(a.title).toBe("డెస్క్ టైటిల్");
    expect(a.body).toBeNull();
    expect(a.tags).toEqual([]);
    expect(a.featuredImage).toBeNull();
  });
  // Owner 2026-10-25: "only the title is getting saved, not the description and
  // tags and other things" - the article carried title + summary + video only.
  test("carries the description as the body, the tags, the thumbnail and the source url", () => {
    const chosen = {
      ...run.chosen,
      description: "హుక్ లైన్\nకథ మొదటి పేరా & వివరాలు.\n\nకథ రెండో పేరా https://x.y/z\nపూర్తి వార్త: https://rayalaseemanews.com/videos/x\n#tag1 #tag2\n00:00 ప్రారంభం\n🌐 rayalaseemanews.com",
      tags: ["ధర్మవరం", "Dharmavaram", "ధర్మవరం", " "],
    };
    const a = articlePayloadFrom({ ...run, chosen });
    expect(a.body).toBe("హుక్ లైన్\n\nకథ మొదటి పేరా & వివరాలు.\n\nకథ రెండో పేరా");
    expect(a.tags).toEqual(["ధర్మవరం", "Dharmavaram"]);
    expect(a.featuredImage).toBe("https://blob/t.jpg");
    expect(a.sourceUrl).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    expect(a.summary).toBe(SAMPLE.summary_te);
  });
  test("summary falls back to the description's hook line when the model gave none", () => {
    const a = articlePayloadFrom({ ...run, suggestions: { ...SAMPLE, summary_te: "" }, chosen: { ...run.chosen, description: "హుక్ లైన్\nకథ" } });
    expect(a.summary).toBe("హుక్ లైన్");
  });
});

describe("descriptionWithArticleLink", () => {
  const url = "https://rayalaseemanews.com/videos/x";
  test("inserts the link after the hook lines and is idempotent (Review Focus 3)", () => {
    const d = "హుక్\nEnglish line\nProddatur News | ప్రొద్దుటూరు న్యూస్\n\nకథ";
    const out = descriptionWithArticleLink(d, url)!;
    expect(out.split("\n")[2]).toBe(`పూర్తి వార్త: ${url}`);
    expect(descriptionWithArticleLink(out, url)).toBeNull();
  });
  test("short description gets the link appended", () => {
    expect(descriptionWithArticleLink("హుక్", url)).toBe(`హుక్\nపూర్తి వార్త: ${url}`);
  });
});

describe("runSummary", () => {
  test("maps a run to a card", () => {
    const s = runSummary({ id: "r1", status: "APPLIED", deskTitle: "d", videoId: "abcdefghijk", scores: { overall: 91 }, thumbnails: [{ renderedUrl: "https://blob/t.jpg" }], chosen: { thumbnailUrl: "https://blob/c.jpg", title: "a | b" }, applied: { warnings: ["x"] }, createdBy: { name: "Admin" }, createdAt: new Date("2026-10-22T00:00:00Z"), contentId: null, frames: [] } as any);
    expect(s).toEqual({ id: "r1", status: "APPLIED", title: "a | b", deskTitle: "d", score: 91, thumb: "https://blob/c.jpg", videoId: "abcdefghijk", warnings: 1, createdBy: "Admin", createdAt: "2026-10-22T00:00:00.000Z", contentId: null });
  });
});
