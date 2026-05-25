// J1 (#136) — Zod payload schema unit tests. Runs under bun test:
//   bun test packages/db
//
// Covers each ContentType: valid + invalid cases, boundary conditions,
// .strict() unknown-key rejection.
import { describe, test, expect } from "bun:test";
import { ContentType } from "@prisma/client";
import { safeValidatePayload, validatePayload } from "../src/payload-schemas";

describe("ARTICLE payload", () => {
  test("accepts empty payload", () => {
    expect(safeValidatePayload(ContentType.ARTICLE, {}).success).toBe(true);
  });
  test("accepts rating + reviewer", () => {
    const r = safeValidatePayload(ContentType.ARTICLE, { rating: 4.5, reviewerName: "Sankar" });
    expect(r.success).toBe(true);
  });
  test("rejects rating > 5", () => {
    expect(safeValidatePayload(ContentType.ARTICLE, { rating: 6 }).success).toBe(false);
  });
  test("rejects rating < 0", () => {
    expect(safeValidatePayload(ContentType.ARTICLE, { rating: -1 }).success).toBe(false);
  });
  test("rejects unknown key (strict mode)", () => {
    expect(safeValidatePayload(ContentType.ARTICLE, { extraField: 1 }).success).toBe(false);
  });
});

describe("VIDEO payload", () => {
  test("accepts youtube + duration", () => {
    expect(safeValidatePayload(ContentType.VIDEO, { videoUrl: "https://youtu.be/xyz", duration: 120 }).success).toBe(true);
  });
  test("rejects non-URL videoUrl", () => {
    expect(safeValidatePayload(ContentType.VIDEO, { videoUrl: "not-a-url", duration: 60 }).success).toBe(false);
  });
  test("rejects negative duration", () => {
    expect(safeValidatePayload(ContentType.VIDEO, { videoUrl: "https://yt.com/x", duration: -1 }).success).toBe(false);
  });
  test("accepts optional thumbnailUrl", () => {
    const r = safeValidatePayload(ContentType.VIDEO, {
      videoUrl: "https://yt.com/x",
      duration: 60,
      thumbnailUrl: "https://blob.azure.com/thumb.jpg",
    });
    expect(r.success).toBe(true);
  });
});

describe("REEL payload", () => {
  test("accepts clip + duration", () => {
    expect(safeValidatePayload(ContentType.REEL, { clipUrl: "https://blob.azure.com/r.mp4", duration: 30 }).success).toBe(true);
  });
  test("rejects missing clipUrl", () => {
    expect(safeValidatePayload(ContentType.REEL, { duration: 30 }).success).toBe(false);
  });
});

describe("WEB_STORY payload", () => {
  test("accepts 1 slide", () => {
    const r = safeValidatePayload(ContentType.WEB_STORY, {
      slides: [{ image: "https://x.com/1.jpg", caption: "first" }],
    });
    expect(r.success).toBe(true);
  });
  test("rejects empty slides array", () => {
    expect(safeValidatePayload(ContentType.WEB_STORY, { slides: [] }).success).toBe(false);
  });
  test("accepts 20 slides", () => {
    const slides = Array.from({ length: 20 }, (_, i) => ({ image: `https://x.com/${i}.jpg` }));
    expect(safeValidatePayload(ContentType.WEB_STORY, { slides }).success).toBe(true);
  });
  test("rejects 21 slides (max enforced)", () => {
    const slides = Array.from({ length: 21 }, (_, i) => ({ image: `https://x.com/${i}.jpg` }));
    expect(safeValidatePayload(ContentType.WEB_STORY, { slides }).success).toBe(false);
  });
});

describe("PHOTO_GALLERY payload", () => {
  test("accepts 1 photo", () => {
    const r = safeValidatePayload(ContentType.PHOTO_GALLERY, {
      photos: [{ url: "https://x.com/p.jpg" }],
    });
    expect(r.success).toBe(true);
  });
  test("rejects empty photos", () => {
    expect(safeValidatePayload(ContentType.PHOTO_GALLERY, { photos: [] }).success).toBe(false);
  });
  test("accepts 100 photos", () => {
    const photos = Array.from({ length: 100 }, (_, i) => ({ url: `https://x.com/${i}.jpg` }));
    expect(safeValidatePayload(ContentType.PHOTO_GALLERY, { photos }).success).toBe(true);
  });
});

describe("CARTOON payload", () => {
  test("accepts caption + ISO date", () => {
    expect(safeValidatePayload(ContentType.CARTOON, {
      caption: "Political satire",
      date: "2026-05-25T00:00:00Z",
    }).success).toBe(true);
  });
  test("rejects non-ISO date", () => {
    expect(safeValidatePayload(ContentType.CARTOON, { date: "not-iso" }).success).toBe(false);
  });
  test("rejects missing date", () => {
    expect(safeValidatePayload(ContentType.CARTOON, { caption: "only" }).success).toBe(false);
  });
});

describe("BREAKING_NEWS payload", () => {
  test("accepts priority 1-10", () => {
    expect(safeValidatePayload(ContentType.BREAKING_NEWS, { priority: 5 }).success).toBe(true);
    expect(safeValidatePayload(ContentType.BREAKING_NEWS, { priority: 1 }).success).toBe(true);
    expect(safeValidatePayload(ContentType.BREAKING_NEWS, { priority: 10 }).success).toBe(true);
  });
  test("rejects priority 0 / 11", () => {
    expect(safeValidatePayload(ContentType.BREAKING_NEWS, { priority: 0 }).success).toBe(false);
    expect(safeValidatePayload(ContentType.BREAKING_NEWS, { priority: 11 }).success).toBe(false);
  });
  test("accepts optional expiresAt", () => {
    const r = safeValidatePayload(ContentType.BREAKING_NEWS, {
      priority: 5,
      expiresAt: "2026-05-25T12:00:00Z",
    });
    expect(r.success).toBe(true);
  });
  test("rejects malformed expiresAt", () => {
    expect(safeValidatePayload(ContentType.BREAKING_NEWS, {
      priority: 5,
      expiresAt: "soon",
    }).success).toBe(false);
  });
});

describe("validatePayload (throwing variant)", () => {
  test("returns parsed payload on success", () => {
    const out = validatePayload(ContentType.ARTICLE, { rating: 3.5 });
    expect(out.rating).toBe(3.5);
  });
  test("throws ZodError on failure", () => {
    expect(() => validatePayload(ContentType.ARTICLE, { rating: 99 })).toThrow();
  });
});
