// Owner feedback 2026-10-24: runs felt stuck and blind. These pin the fixes:
// immediate pickup of a fresh run, a live event feed, caption polling that
// really waits 30 minutes between polls (not forever), and a desk title for
// back-catalog runs.
import { describe, test, expect } from "bun:test";
import { runStage, processQueue } from "../../src/lib/video-iq/worker";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

const JPEG = new Uint8Array([0xff, 0xd8, 1, 2]);
const MIN = 60_000;

function world(rowOver: Partial<any> = {}, over: Partial<any> = {}) {
  const row: any = { id: "r1", contentId: null, source: "BLOB", blobUrl: "https://blob/x.mp4", videoId: null, status: "QUEUED", attempts: 0, transcript: null, suggestions: null, frames: null, thumbnails: null, scores: null, error: null, events: null, lastPollAt: null, deskTitle: "ప్రొద్దుటూరులో దాడి", breaking: false, updatedAt: new Date(), ...rowOver };
  const calls: string[] = [];
  const prisma = {
    videoOptimization: {
      update: async ({ data }: any) => { Object.assign(row, data, { updatedAt: new Date() }); return row; },
      findMany: async ({ where }: any) => {
        const stale = where?.OR?.find((c: any) => c.updatedAt)?.updatedAt?.lt ?? where?.updatedAt?.lt;
        const fresh = where?.OR?.some((c: any) => c.status === "QUEUED");
        // Separate object per query, like Prisma.
        if (!stale && !fresh) return [{ ...row }];
        if (fresh && row.status === "QUEUED") return [{ ...row }];
        return stale && row.updatedAt < stale ? [{ ...row }] : [];
      },
      updateMany: async ({ where, data }: any) => {
        const okStale = where.updatedAt?.lt ? row.updatedAt < where.updatedAt.lt : true;
        const okExact = where.updatedAt instanceof Date ? row.updatedAt.getTime() === where.updatedAt.getTime() : true;
        if (where.id === row.id && okStale && okExact) { Object.assign(row, data); return { count: 1 }; }
        return { count: 0 };
      },
    },
    content: { findUnique: async () => null },
    channelVideo: { findUnique: async ({ where }: any) => (where.videoId === "abcdefghijk" ? { title: "కేటలాగ్ టైటిల్ | Catalog Title" } : null) },
    keywordVolume: { findMany: async () => [], upsert: async () => ({}) },
  };
  return {
    row, calls, prisma,
    media: { probe: async () => ({ durationSec: 60, width: 1280, height: 720, hasAudio: true }), extractAudioMp3: async () => new Uint8Array(1000), extractFrames: async () => [JPEG, JPEG, JPEG] },
    transcribe: { transcribeAudio: async () => ({ locale: "te-IN", durationSec: 60, segments: [{ start: 0, end: 5, text: "రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై" }], words: 30 }), transcriptFromCaptions: async () => { calls.push("captions"); return null; } },
    analyze: { analyzeVideo: async (i: any) => { calls.push(`analyze:${i.deskTitle}`); return SAMPLE; } },
    keywords: { enrichKeywords: async () => ({ terms: [], suggested: [], serp: [], unavailable: "DataForSEO not configured" }) },
    thumbnail: { renderThumbnail: async () => ({ jpeg: JPEG, width: 1280, height: 720 }) },
    blob: { uploadBuffer: async () => "https://blob/t.jpg" },
    youtube: { listMyPlaylists: async () => [{ id: "PL1", title: "Politics" }], listCaptions: async () => [], downloadCaption: async () => "" },
    dfs: null,
    ...over,
  };
}

describe("fresh runs start at once", () => {
  test("processQueue picks a QUEUED row created seconds ago and carries it to READY", async () => {
    const w = world({ updatedAt: new Date() });
    const r = await processQueue(w as any, 3);
    expect(r.processed).toEqual(["r1"]);
    expect(w.row.status).toBe("READY");
  });
  test("two runners racing for the same fresh row: only one wins", async () => {
    const w = world({ updatedAt: new Date(Date.now() - 1000) }); // created a second ago (ms-distinct from the claim bump)
    let probes = 0;
    w.media.probe = async () => { probes++; await new Promise((r) => setTimeout(r, 20)); return { durationSec: 60, width: 1280, height: 720, hasAudio: true }; };
    const [a, b] = await Promise.all([processQueue(w as any), processQueue(w as any)]);
    expect(a.processed.length + b.processed.length).toBe(1);
    expect(probes).toBe(1);
  });
});

describe("live event feed", () => {
  test("every stage appends timestamped events the UI can show", async () => {
    const w = world();
    for (let i = 0; i < 4; i++) await runStage(w.row, w as any);
    const texts = (w.row.events as Array<{ at: string; text: string }>).map((e) => e.text);
    expect(texts.some((t) => /frames/i.test(t))).toBe(true);
    expect(texts.some((t) => /transcript.*30 words/i.test(t))).toBe(true);
    expect(texts.some((t) => /3 titles/i.test(t))).toBe(true);
    expect(texts.some((t) => /keywords.*unavailable/i.test(t))).toBe(true);
    expect(texts.some((t) => /thumbnails/i.test(t))).toBe(true);
    expect(texts.some((t) => /overall/i.test(t))).toBe(true);
    expect(w.row.events.every((e: any) => typeof e.at === "string")).toBe(true);
  });
});

describe("caption polling waits from the last poll, not from the claim bump", () => {
  const base = { source: "YOUTUBE", videoId: "abcdefghijk", blobUrl: null, status: "TRANSCRIBING", frames: [{ t: 0, url: "x" }] };
  test("first tick polls and records lastPollAt", async () => {
    const w = world({ ...base, attempts: 0 });
    await runStage(w.row, w as any);
    expect(w.calls).toEqual(["captions"]);
    expect(w.row.lastPollAt).toBeInstanceOf(Date);
    expect(w.row.attempts).toBe(1);
  });
  test("claim bumps within 30 minutes do not trigger another poll; after 30 minutes it polls again", async () => {
    const w = world({ ...base, attempts: 1, lastPollAt: new Date(Date.now() - 10 * MIN), updatedAt: new Date() });
    await runStage(w.row, w as any);
    expect(w.calls).toEqual([]);
    w.row.lastPollAt = new Date(Date.now() - 31 * MIN);
    w.row.updatedAt = new Date(); // just claimed
    await runStage(w.row, w as any);
    expect(w.calls).toEqual(["captions"]);
    expect(w.row.attempts).toBe(2);
  });
  test("skipCaptions flag makes the next tick analyse from the desk title without polling", async () => {
    const w = world({ ...base, attempts: 3, lastPollAt: new Date(), suggestions: { skipCaptions: true } });
    await runStage(w.row, w as any);
    expect(w.calls).toEqual(["analyze:ప్రొద్దుటూరులో దాడి"]);
    expect(w.row.status).toBe("ANALYZING");
    expect(w.row.suggestions.captionsGivenUp).toBe(true);
  });
});

describe("back-catalog desk title", () => {
  test("an empty desk title is filled from the channel catalog before analysis", async () => {
    const w = world({ source: "YOUTUBE", videoId: "abcdefghijk", blobUrl: null, status: "TRANSCRIBING", deskTitle: "", transcript: { locale: "te-IN", durationSec: 60, segments: [{ start: 0, end: 5, text: "రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై" }], words: 30 }, frames: [{ t: 0, url: "x" }] });
    await runStage(w.row, w as any);
    expect(w.calls).toEqual(["analyze:కేటలాగ్ టైటిల్ | Catalog Title"]);
    expect(w.row.deskTitle).toBe("కేటలాగ్ టైటిల్ | Catalog Title");
  });
});
