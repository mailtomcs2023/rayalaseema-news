// Tests written for the post-review fix pass (reviewer findings C1, I1–I5, M8).
import { describe, test, expect } from "bun:test";
import { runStage, processQueue } from "../../src/lib/video-iq/worker";
import { publishOptimization, classifyPublishError } from "../../src/lib/video-iq/publish";
import { canPublish } from "../../src/components/video-iq/panel-logic";
import { YouTubeAuthError, YouTubeQuotaError } from "@rayalaseema/youtube";
import { QuotaBudgetError } from "../../src/lib/video-iq/quota";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

const JPEG = new Uint8Array([0xff, 0xd8, 1, 2]);
const MIN = 60_000;

function worldFor(rowOver: Partial<any> = {}, over: Partial<any> = {}) {
  const row: any = { id: "r1", contentId: "c1", source: "BLOB", blobUrl: "https://blob/x.mp4", videoId: null, status: "QUEUED", attempts: 0, transcript: null, suggestions: null, frames: null, thumbnails: null, scores: null, error: null, updatedAt: new Date(Date.now() - 10 * MIN), ...rowOver };
  const calls: string[] = [];
  const content: any = { id: "c1", title: "రాచమల్లు ప్రెస్ మీట్", summary: "", body: "", breaking: false, constituency: null, ...(over.content ?? {}) };
  const prisma = {
    videoOptimization: {
      update: async ({ data }: any) => { Object.assign(row, data, { updatedAt: new Date() }); return row; },
      findMany: async ({ where }: any) => {
        // Mirrors processQueue's candidate query: stale rows, or fresh QUEUED rows.
        const stale = where?.OR?.find((c: any) => c.updatedAt)?.updatedAt?.lt ?? where?.updatedAt?.lt;
        const freshQueued = Boolean(where?.OR?.some((c: any) => c.status === "QUEUED")) && row.status === "QUEUED" && (row.attempts ?? 0) === 0;
        // Separate object per query, like Prisma: a racing runner must not see the other's claim through a shared reference.
        if (!stale) return [{ ...row }];
        return freshQueued || row.updatedAt < stale ? [{ ...row }] : [];
      },
      updateMany: async ({ where, data }: any) => {
        const okStale = where.updatedAt?.lt ? row.updatedAt < where.updatedAt.lt : true;
        const okExact = where.updatedAt instanceof Date ? row.updatedAt.getTime() === where.updatedAt.getTime() : true;
        if (where.id === row.id && okStale && okExact) { Object.assign(row, data); return { count: 1 }; }
        return { count: 0 };
      },
    },
    content: { findUnique: async () => content },
    keywordVolume: { findMany: async () => [], upsert: async () => ({}) },
  };
  const thumbCalls: any[] = [];
  return {
    row, calls, content, prisma, thumbCalls,
    media: { probe: async () => ({ durationSec: 600, width: 1920, height: 1080, hasAudio: true }), extractAudioMp3: async () => new Uint8Array([1]), extractFrames: async () => [JPEG] },
    transcribe: { transcribeAudio: async () => ({ locale: "te-IN", durationSec: 600, segments: [{ start: 0, end: 5, text: "రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై" }], words: 4 }), transcriptFromCaptions: async () => { calls.push("captions"); return null; } },
    analyze: { analyzeVideo: async (i: any) => { calls.push(`analyze:${i.transcript ? "transcript" : "none"}:${i.breaking}`); return SAMPLE; } },
    keywords: { enrichKeywords: async () => ({ terms: [], suggested: [], serp: [] }) },
    thumbnail: { renderThumbnail: async (a: any) => { thumbCalls.push(a); return { jpeg: JPEG, width: 1280, height: 720 }; } },
    blob: { uploadBuffer: async () => "https://blob/t.jpg" },
    youtube: { listMyPlaylists: async () => [{ id: "PL1", title: "Politics" }], listCaptions: async () => [], downloadCaption: async () => "" },
    dfs: null,
    ...over,
  };
}

describe("C1: YOUTUBE source caption polling is rate limited and capped", () => {
  test("second tick within 30 minutes of the last poll does not call captions again", async () => {
    const w = worldFor({ source: "YOUTUBE", videoId: "abcdefghijk", blobUrl: null, status: "TRANSCRIBING", attempts: 1, lastPollAt: new Date(Date.now() - 5 * MIN), updatedAt: new Date() });
    await runStage(w.row, w as any);
    expect(w.calls).toEqual([]);
    expect(w.row.status).toBe("TRANSCRIBING");
  });
  test("a tick 30 minutes after the last poll polls once", async () => {
    const w = worldFor({ source: "YOUTUBE", videoId: "abcdefghijk", blobUrl: null, status: "TRANSCRIBING", attempts: 1, lastPollAt: new Date(Date.now() - 31 * MIN), updatedAt: new Date() });
    await runStage(w.row, w as any);
    expect(w.calls).toEqual(["captions"]);
    expect(w.row.attempts).toBe(2);
  });
  test("after 48 attempts the row proceeds without a transcript (low-confidence path)", async () => {
    const w = worldFor({ source: "YOUTUBE", videoId: "abcdefghijk", blobUrl: null, status: "TRANSCRIBING", attempts: 48, updatedAt: new Date(Date.now() - 31 * MIN) });
    await runStage(w.row, w as any);
    expect(w.calls).toEqual(["analyze:none:false"]);
    expect(w.row.status).toBe("ANALYZING");
    expect(w.row.suggestions.low_confidence).toBe(true);
  });
});

describe("I2: the desk breaking flag reaches the thumbnail badge and the title score", () => {
  test("breaking content renders the badge and is not penalised for బ్రేకింగ్", async () => {
    const w = worldFor({ status: "TRANSCRIBING", transcript: { locale: "te-IN", durationSec: 600, segments: [{ start: 0, end: 5, text: "రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై" }], words: 30 }, suggestions: { probe: { durationSec: 600, width: 1920, height: 1080 } }, frames: [{ t: 1, url: "https://blob/f.jpg" }] }, { content: { breaking: true } });
    await runStage(w.row, w as any); // → ANALYZING
    expect(w.row.suggestions.breaking).toBe(true);
    await runStage(w.row, w as any); // → READY
    expect(w.thumbCalls[0].breaking).toBe(true);
  });
});

describe("smoke finding: an invalid model output is retried, not fatal on the first attempt", () => {
  test("first invalid output keeps TRANSCRIBING with attempts 1; third marks FAILED", async () => {
    const base = { status: "TRANSCRIBING", transcript: { locale: "te-IN", durationSec: 60, segments: [{ start: 0, end: 5, text: "రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై" }], words: 30 }, suggestions: { probe: { durationSec: 60, width: 1280, height: 720 } } };
    const w = worldFor(base, { analyze: { analyzeVideo: async () => { throw new Error("model output invalid: titles.0.text Too big"); } } });
    await runStage(w.row, w as any);
    expect(w.row.status).toBe("TRANSCRIBING");
    expect(w.row.attempts).toBe(1);
    await runStage(w.row, w as any);
    await runStage(w.row, w as any);
    expect(w.row.status).toBe("FAILED");
  });
});

describe("studio: desk context comes from the run when no Content is linked", () => {
  test("deskTitle/deskNotes/district/breaking reach the analyzer and the stored suggestions", async () => {
    const w = worldFor({ contentId: null, deskTitle: "ప్రొద్దుటూరులో దాడి", deskNotes: "desk notes", district: "Kadapa", breaking: true, status: "TRANSCRIBING", transcript: { locale: "te-IN", durationSec: 60, segments: [{ start: 0, end: 5, text: "రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై" }], words: 30 }, suggestions: { probe: { durationSec: 60, width: 1280, height: 720 } } });
    let seen: any = null;
    (w as any).analyze = { analyzeVideo: async (i: any) => { seen = i; return SAMPLE; } };
    (w as any).prisma.content.findUnique = async () => { throw new Error("must not load content"); };
    await runStage(w.row, w as any);
    expect(seen.deskTitle).toBe("ప్రొద్దుటూరులో దాడి");
    expect(seen.deskDescription).toBe("desk notes");
    expect(seen.district).toBe("Kadapa");
    expect(seen.breaking).toBe(true);
    expect(w.row.suggestions.breaking).toBe(true);
  });
});

describe("I4: processQueue claims rows before running them", () => {
  test("two overlapping queue runs process the row once", async () => {
    const w = worldFor({ updatedAt: new Date(Date.now() - 10 * MIN) });
    let probes = 0;
    w.media.probe = async () => { probes++; await new Promise((r) => setTimeout(r, 20)); return { durationSec: 600, width: 1920, height: 1080, hasAudio: true }; };
    const [a, b] = await Promise.all([processQueue(w as any), processQueue(w as any)]);
    expect(a.processed.length + b.processed.length).toBe(1);
    expect(probes).toBe(1);
  });
  test("a row mid-flight touched in the last 90 seconds is skipped (fresh QUEUED rows are not)", async () => {
    const w = worldFor({ status: "EXTRACTING", updatedAt: new Date() });
    const r = await processQueue(w as any);
    expect(r.processed).toEqual([]);
  });
});

function publishWorld(over: Partial<any> = {}) {
  const row: any = { id: "r1", contentId: "c1", source: "BLOB", blobUrl: "https://blob/x.mp4", videoId: null, status: "APPROVED", suggestions: SAMPLE, transcript: null, thumbnails: [], chosen: { title: "రాచమల్లు ఫైర్ | Rachamallu Siva Prasad Reddy Proddatur", thumbnailIndex: null, thumbnailUrl: null, description: "హుక్", tags: ["a", "b", "c", "d", "e"], chapters: [], hashtags: [], playlists: [], comment: "" }, ...(over.row ?? {}) };
  const content: any = { id: "c1", slug: "s", status: "DRAFT", scheduledAt: null, payload: { videoUrl: "https://youtu.be/OLD12345678", videoId: "OLD12345678" }, ...(over.content ?? {}) };
  const updates: any[] = [];
  const prisma = {
    videoOptimization: { findUnique: async () => row, update: async ({ data }: any) => { updates.push(data); Object.assign(row, data); return row; } },
    content: { findUnique: async () => content, update: async ({ data }: any) => { Object.assign(content, data); return content; } },
    socialPost: { upsert: async () => ({}) },
  };
  const ytCalls: any[] = [];
  const youtube = {
    uploadVideo: async () => "VID12345678", setThumbnail: async () => {}, listMyPlaylists: async () => [], addToPlaylist: async () => {},
    setLocalizations: async () => {}, updateSnippetStatus: async (id: string, snippet: any, status: any) => { ytCalls.push({ id, status }); }, insertComment: async () => {},
    ...(over.youtube ?? {}),
  };
  return { row, content, updates, prisma, youtube, ytCalls, fetchBlob: over.fetchBlob ?? (async () => ({ bytes: new Uint8Array([1]), size: 1 })), sitemapUrlFor: async () => null };
}

describe("I1: publish error classification", () => {
  test("a failed blob fetch before the upload leaves the row APPROVED and rethrows", async () => {
    const w = publishWorld({ fetchBlob: async () => { throw new Error("fetch 503 for https://blob/x.mp4"); } });
    await expect(publishOptimization("r1", w as any)).rejects.toThrow(/503/);
    expect(w.row.status).toBe("APPROVED");
  });
  test("precondition failures write nothing", async () => {
    const w = publishWorld({ row: { status: "APPLIED", videoId: "VID12345678" } });
    await expect(publishOptimization("r1", w as any)).rejects.toThrow(/APPROVED/);
    expect(w.updates).toEqual([]);
    expect(w.row.status).toBe("APPLIED");
  });
  test("classifyPublishError maps errors to HTTP status and whether the row may be marked FAILED", () => {
    expect(classifyPublishError(new QuotaBudgetError())).toEqual({ status: 429, keepApproved: true });
    expect(classifyPublishError(new YouTubeQuotaError())).toEqual({ status: 429, keepApproved: true });
    expect(classifyPublishError(new YouTubeAuthError("invalid_grant"))).toEqual({ status: 503, keepApproved: true });
    expect(classifyPublishError(new Error("run is APPLIED, not APPROVED"))).toEqual({ status: 409, keepApproved: true });
    expect(classifyPublishError(new Error("fetch 503 for x"))).toEqual({ status: 502, keepApproved: true });
    expect(classifyPublishError(new Error("something else"))).toEqual({ status: 500, keepApproved: false });
  });
});

describe("I5: back-catalog publish never changes a live video's privacy", () => {
  test("YOUTUBE source with DRAFT content updates the snippet only", async () => {
    const w = publishWorld({ row: { source: "YOUTUBE", videoId: "OLD12345678", blobUrl: null } });
    await publishOptimization("r1", w as any);
    expect(w.ytCalls[0].status).toBeUndefined();
  });
  test("YOUTUBE source with PUBLISHED content still sends public status", async () => {
    const w = publishWorld({ row: { source: "YOUTUBE", videoId: "OLD12345678", blobUrl: null }, content: { status: "PUBLISHED" } });
    await publishOptimization("r1", w as any);
    expect(w.ytCalls[0].status?.privacyStatus).toBe("public");
  });
});

describe("M8: transcript written to the payload fits the strict schema", () => {
  test("a transcript longer than 60,000 chars is truncated", async () => {
    const long = Array.from({ length: 7000 }, (_, i) => ({ start: i, end: i + 1, text: "అఆఇఈఉఊఋఎఏఐ" }));
    const w = publishWorld({ row: { transcript: { locale: "te-IN", durationSec: 7000, segments: long, words: 7000 } }, content: { status: "PUBLISHED" } });
    await publishOptimization("r1", w as any);
    expect([...(w.content.payload.transcript as string)].length).toBeLessThanOrEqual(60_000);
  });
});

describe("I3: unsaved panel edits block Publish", () => {
  const row: any = { status: "APPROVED", source: "BLOB", suggestions: SAMPLE, chosen: { title: "a | b" } };
  test("dirty choice is not publishable until saved", () => {
    expect(canPublish(row, "EDITOR", true).reason).toMatch(/save/i);
    expect(canPublish(row, "EDITOR", false).ok).toBe(true);
  });
});
