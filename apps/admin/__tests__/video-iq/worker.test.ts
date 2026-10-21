import { describe, test, expect } from "bun:test";
import { runStage, processQueue } from "../../src/lib/video-iq/worker";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

const JPEG = new Uint8Array([0xff, 0xd8, 1, 2]);

function deps(over: Partial<any> = {}) {
  const row: any = { id: "r1", contentId: "c1", source: "BLOB", blobUrl: "https://blob/x.mp4", videoId: null, status: "QUEUED", attempts: 0, transcript: null, suggestions: null, frames: null, thumbnails: null, scores: null, error: null };
  const updates: any[] = [];
  const prisma = {
    videoOptimization: {
      update: async ({ data }: any) => { Object.assign(row, data, { updatedAt: new Date() }); updates.push(data); return row; },
      findMany: async () => [row],
      updateMany: async () => ({ count: 1 }),
    },
    content: {
      findUnique: async () => ({ id: "c1", title: "రాచమల్లు ప్రెస్ మీట్", summary: "", body: "", breaking: false, constituency: { district: { nameEn: "Kadapa" } } }),
    },
    keywordVolume: { findMany: async () => [], upsert: async () => ({}) },
  };
  const d = {
    prisma, row, updates,
    media: {
      probe: async () => ({ durationSec: 600, width: 1920, height: 1080, hasAudio: true }),
      extractAudioMp3: async () => new Uint8Array([1]),
      extractFrames: async () => [JPEG, JPEG, JPEG],
    },
    transcribe: {
      transcribeAudio: async () => ({ locale: "te-IN", durationSec: 600, segments: [{ start: 0, end: 5, text: "రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై" }], words: 4 }),
      transcriptFromCaptions: async () => null,
    },
    analyze: { analyzeVideo: async () => SAMPLE },
    keywords: { enrichKeywords: async () => ({ terms: [{ term: "proddatur news", volume: 1000, competition: "LOW" }], suggested: [], serp: [] }) },
    thumbnail: { renderThumbnail: async () => ({ jpeg: JPEG, width: 1280, height: 720 }) },
    blob: { uploadBuffer: async (_b: Buffer, ext: string) => `https://blob/${Math.random().toString(36).slice(2)}.${ext}` },
    youtube: { listMyPlaylists: async () => [{ id: "PL1", title: "Politics" }, { id: "PL2", title: "District Stories" }], listCaptions: async () => [], downloadCaption: async () => "" },
    dfs: null,
    ...over,
  };
  return d;
}

describe("worker stages", () => {
  test("QUEUED → EXTRACTING → TRANSCRIBING → ANALYZING → READY with artifacts", async () => {
    const d = deps();
    await runStage(d.row, d as any);
    expect(d.row.status).toBe("EXTRACTING");
    expect(d.row.frames.length).toBe(3);
    expect(d.row.frames[0].url).toMatch(/^https:\/\/blob\//);

    await runStage(d.row, d as any);
    expect(d.row.status).toBe("TRANSCRIBING");
    expect(d.row.transcript.segments.length).toBe(1);

    await runStage(d.row, d as any);
    expect(d.row.status).toBe("ANALYZING");
    expect(d.row.suggestions.titles.length).toBe(3);
    expect(d.row.suggestions.keywords.terms[0].volume).toBe(1000);
    expect(d.row.suggestions.hook.late).toBe(false);
    expect(d.row.suggestions.format).toBe("VIDEO");

    await runStage(d.row, d as any);
    expect(d.row.status).toBe("READY");
    expect(d.row.scores.overall).toBeGreaterThan(0);
    expect(d.row.thumbnails.length).toBe(3);
    expect(d.row.thumbnails[0].renderedUrl).toMatch(/^https:\/\/blob\//);
  });

  test("vertical 90s clip is a SHORT: no thumbnails rendered, thumbnail score 100", async () => {
    const d = deps({ media: { probe: async () => ({ durationSec: 90, width: 1080, height: 1920, hasAudio: true }), extractAudioMp3: async () => new Uint8Array([1]), extractFrames: async () => [JPEG, JPEG, JPEG] } });
    for (let i = 0; i < 4; i++) await runStage(d.row, d as any);
    expect(d.row.status).toBe("READY");
    expect(d.row.suggestions.format).toBe("SHORT");
    expect(d.row.thumbnails).toEqual([]);
    expect(d.row.scores.thumbnail).toBe(100);
  });

  test("no audio marks FAILED with 'no audio'", async () => {
    const d = deps({ media: { probe: async () => ({ durationSec: 10, width: 640, height: 360, hasAudio: false }), extractAudioMp3: async () => { throw new Error("no audio track in video"); }, extractFrames: async () => [JPEG] } });
    await runStage(d.row, d as any);
    await runStage(d.row, d as any);
    expect(d.row.status).toBe("FAILED");
    expect(d.row.error).toMatch(/no audio/);
  });

  test("transient error retries up to 3 attempts then FAILED", async () => {
    let calls = 0;
    const d = deps({ transcribe: { transcribeAudio: async () => { calls++; throw new Error("speech transcription failed: 503"); }, transcriptFromCaptions: async () => null } });
    await runStage(d.row, d as any); // QUEUED → EXTRACTING
    await runStage(d.row, d as any);
    expect(d.row.status).toBe("EXTRACTING");
    expect(d.row.attempts).toBe(1);
    await runStage(d.row, d as any);
    await runStage(d.row, d as any);
    expect(d.row.status).toBe("FAILED");
    expect(calls).toBe(3);
  });

  test("YOUTUBE source without captions stays TRANSCRIBING with a retry note", async () => {
    const d = deps();
    d.row.source = "YOUTUBE";
    d.row.videoId = "abcdefghijk";
    d.row.blobUrl = null;
    await runStage(d.row, d as any);
    expect(d.row.status).toBe("TRANSCRIBING");
    expect(d.row.frames[0].url).toContain("abcdefghijk");
    await runStage(d.row, d as any);
    expect(d.row.status).toBe("TRANSCRIBING");
    expect(d.row.error).toMatch(/captions not ready/);
  });

  test("processQueue carries a claimed row through every stage in one call", async () => {
    const d = deps();
    const r = await processQueue(d as any, 3);
    expect(r.processed).toEqual(["r1"]);
    expect(d.row.status).toBe("READY");
    expect(d.row.thumbnails.length).toBe(3);
  });

  test("processQueue stops at a stage that is waiting (captions not ready) instead of spinning", async () => {
    const d = deps();
    d.row.source = "YOUTUBE"; d.row.videoId = "abcdefghijk"; d.row.blobUrl = null;
    let polls = 0;
    d.transcribe.transcriptFromCaptions = async () => { polls++; return null; };
    await processQueue(d as any, 3);
    expect(d.row.status).toBe("TRANSCRIBING");
    expect(polls).toBe(1);
  });

  test("activeRunExists reports an in-flight run for the content", async () => {
    const { activeRunExists } = await import("../../src/lib/video-iq/worker");
    const prisma = { videoOptimization: { findFirst: async ({ where }: any) => (where.contentId === "c1" ? { id: "r1", status: "EXTRACTING" } : null) } };
    expect(await activeRunExists(prisma, "c1")).toEqual({ id: "r1", status: "EXTRACTING" });
    expect(await activeRunExists(prisma, "c2")).toBeNull();
  });
});
