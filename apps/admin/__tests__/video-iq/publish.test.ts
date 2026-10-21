import { describe, test, expect } from "bun:test";
import { publishOptimization } from "../../src/lib/video-iq/publish";
import { YouTubeQuotaError } from "@rayalaseema/youtube";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

function world(over: Partial<any> = {}) {
  const row: any = {
    id: "r1", contentId: "c1", source: "BLOB", blobUrl: "https://blob/x.mp4", videoId: null, status: "APPROVED",
    suggestions: SAMPLE,
    transcript: { locale: "te-IN", durationSec: 600, segments: [{ start: 0, end: 5, text: "రాచమల్లు ఫైర్" }, { start: 5, end: 9, text: "వరదరాజుల రెడ్డిపై" }], words: 4 },
    thumbnails: [{ renderedUrl: "https://blob/t.jpg" }],
    chosen: {
      title: "రాచమల్లు ఫైర్ | Rachamallu Siva Prasad Reddy Proddatur", thumbnailIndex: 0, thumbnailUrl: "https://blob/t.jpg",
      description: "హుక్\n\nకథ", tags: ["a", "b", "c", "d", "e"], chapters: [], hashtags: [], playlists: ["Politics"], comment: "మీ అభిప్రాయం?",
    },
  };
  const calls: string[] = [];
  const content: any = { id: "c1", slug: "s", status: "PUBLISHED", scheduledAt: null, payload: { videoUrl: "https://blob/x.mp4", duration: 600 } };
  const prisma = {
    videoOptimization: { findUnique: async () => row, update: async ({ data }: any) => { Object.assign(row, data); return row; } },
    content: { findUnique: async () => content, update: async ({ data }: any) => { Object.assign(content, data); return content; } },
    socialPost: { upsert: async ({ create, update }: any) => { calls.push(`social:${(update ?? create).status}`); return {}; } },
  };
  const youtube = {
    uploadVideo: async (a: any) => { calls.push("insert"); calls.push(`privacy:${a.status.privacyStatus}`); return "VID12345678"; },
    setThumbnail: async () => { calls.push("thumb"); },
    listMyPlaylists: async () => [{ id: "PL1", title: "Politics" }],
    addToPlaylist: async (p: string) => { calls.push(`pl:${p}`); },
    setLocalizations: async () => { calls.push("loc"); },
    updateSnippetStatus: async () => { calls.push("update"); },
    insertComment: async () => { calls.push("comment"); },
  };
  return {
    row, content, calls, prisma,
    youtube: { ...youtube, ...(over.youtube ?? {}) },
    fetchBlob: async () => ({ bytes: new Uint8Array([1]), size: 1 }),
    sitemapUrlFor: async () => null,
    ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "youtube")),
  };
}

describe("publishOptimization", () => {
  test("BLOB: inserts public, thumbnail, playlist, localisation, comment; writes payload and SocialPost", async () => {
    const w = world();
    const r = await publishOptimization("r1", w as any);
    expect(r.videoId).toBe("VID12345678");
    expect(r.warnings).toEqual([]);
    expect(w.calls).toEqual(["insert", "privacy:public", "thumb", "pl:PL1", "loc", "comment", "social:POSTED"]);
    expect(w.content.payload.videoId).toBe("VID12345678");
    expect(w.content.payload.videoUrl).toBe("https://www.youtube.com/watch?v=VID12345678");
    expect(w.content.payload.thumbnailUrl).toBe("https://blob/t.jpg");
    expect(w.content.payload.transcript).toBe("రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై");
    expect(w.content.payload.duration).toBe(600);
    expect(w.row.status).toBe("APPLIED");
    expect(w.row.videoId).toBe("VID12345678");
  });

  test("quota error after insert keeps videoId, warns, never re-uploads", async () => {
    const w = world({ youtube: { setThumbnail: async () => { throw new YouTubeQuotaError(); } } });
    const r = await publishOptimization("r1", w as any);
    expect(r.videoId).toBe("VID12345678");
    expect(r.warnings.join()).toMatch(/quota/);
    expect(w.row.status).toBe("APPLIED");
    expect(w.row.videoId).toBe("VID12345678");
    expect(w.calls.filter((c) => c === "insert").length).toBe(1);
    expect(w.row.applied.warnings.length).toBe(1);
  });

  test("YOUTUBE source updates snippet instead of inserting and keeps the existing videoUrl", async () => {
    const w = world();
    w.row.source = "YOUTUBE"; w.row.videoId = "OLD12345678"; w.row.blobUrl = null;
    w.content.payload = { videoUrl: "https://youtu.be/OLD12345678", videoId: "OLD12345678" };
    const r = await publishOptimization("r1", w as any);
    expect(r.videoId).toBe("OLD12345678");
    expect(w.calls[0]).toBe("update");
    expect(w.calls).not.toContain("insert");
    expect(w.content.payload.videoUrl).toBe("https://youtu.be/OLD12345678");
  });

  test("SCHEDULED content uploads private with publishAt", async () => {
    const w = world();
    w.content.status = "SCHEDULED"; w.content.scheduledAt = new Date("2026-10-25T13:30:00Z");
    let status: any = null;
    w.youtube.uploadVideo = async (a: any) => { status = a.status; w.calls.push("insert"); return "VID12345678"; };
    await publishOptimization("r1", w as any);
    expect(status.privacyStatus).toBe("private");
    expect(status.publishAt).toBe("2026-10-25T13:30:00.000Z");
  });

  test("a private upload (DRAFT content) skips the comment step instead of warning", async () => {
    const w = world();
    w.content.status = "DRAFT";
    const r = await publishOptimization("r1", w as any);
    expect(w.calls).not.toContain("comment");
    expect(r.warnings).toEqual([]);
    expect(w.row.applied.comment).toBe("skipped: private video");
  });

  test("a standalone run (no content) publishes with its own visibility and no article link", async () => {
    const w = world();
    w.row.contentId = null; w.row.visibility = "scheduled"; w.row.publishAt = new Date("2026-10-25T13:30:00Z"); w.row.deskTitle = "డెస్క్";
    w.prisma.content.findUnique = async () => { throw new Error("must not load content"); };
    let status: any = null;
    w.youtube.uploadVideo = async (a: any) => { status = a; w.calls.push("insert"); return "VID12345678"; };
    const r = await publishOptimization("r1", w as any);
    expect(status.status.privacyStatus).toBe("private");
    expect(status.status.publishAt).toBe("2026-10-25T13:30:00.000Z");
    expect(status.snippet.description).not.toContain("పూర్తి వార్త");
    expect(r.videoId).toBe("VID12345678");
    expect(w.calls).not.toContain("comment"); // scheduled = private until publishAt
  });

  test("refuses a run that is not APPROVED", async () => {
    const w = world();
    w.row.status = "READY";
    await expect(publishOptimization("r1", w as any)).rejects.toThrow(/APPROVED/);
    expect(w.calls).toEqual([]);
  });
});
