import { describe, test, expect } from "bun:test";
import { catalogScores, syncChannel, rankCheck } from "../../src/lib/video-iq/catalog";

describe("catalogScores", () => {
  test("a bilingual title with a name and a good description scores high; a bare Telugu title scores low", () => {
    const good = catalogScores({ title: "వరదరాజుల రెడ్డిపై రాచమల్లు ఫైర్ | Rachamallu Siva Prasad Reddy vs Varadarajulu Reddy", description: "కడప జిల్లా ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై రాళ్ల దాడి కలకలం.\nProddatur News | ప్రొద్దుటూరు న్యూస్ | Kadapa District News\nఅర్ధరాత్రి జరిగిన ఈ దాడి వెనుక ఎమ్మెల్యే అనుచరులు ఉన్నారని ప్రత్యర్థులు ఆరోపిస్తున్నారు.", tags: Array.from({ length: 16 }, (_, i) => (i % 2 ? `tag${i}` : `ట్యాగ్${i}`)) });
    expect(good.title).toBeGreaterThanOrEqual(80);
    expect(good.content).toBe(100);
    const poor = catalogScores({ title: "హెడ్‌లైన్స్", description: "", tags: [] });
    expect(poor.title).toBeLessThanOrEqual(45);
    expect(poor.content).toBeLessThanOrEqual(50);
  });
});

function fakePrisma() {
  const rows = new Map<string, any>();
  return {
    rows,
    channelVideo: {
      upsert: async ({ where, create, update }: any) => { rows.set(where.videoId, { ...(rows.get(where.videoId) ?? {}), ...create, ...update }); return rows.get(where.videoId); },
      findUnique: async ({ where }: any) => rows.get(where.videoId) ?? null,
      update: async ({ where, data }: any) => { Object.assign(rows.get(where.videoId), data); return rows.get(where.videoId); },
    },
  };
}
const item = (id: string, over: any = {}) => ({
  id,
  snippet: { title: `Title ${id} | Proddatur News`, description: "d", tags: ["a"], publishedAt: "2026-10-20T07:30:00Z", categoryId: "25", thumbnails: { maxres: { url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, width: 1280, height: 720 } }, ...over.snippet },
  contentDetails: { duration: over.duration ?? "PT4M34S" },
  status: { privacyStatus: over.privacy ?? "public" },
  statistics: { viewCount: "59", likeCount: "3", commentCount: "1" },
});

describe("syncChannel", () => {
  test("pages the uploads playlist, fetches details and upserts cards with scores", async () => {
    const prisma = fakePrisma();
    const youtube = {
      listUploadsAll: async () => ["aaaaaaaaaaa", "bbbbbbbbbbb"],
      getVideos: async (ids: string[]) => ({ items: ids.map((id) => item(id, id === "bbbbbbbbbbb" ? { duration: "PT0M45S", privacy: "private", snippet: { thumbnails: { maxres: { url: "u", width: 720, height: 1280 } } } } : {})) }),
    };
    const r = await syncChannel({ prisma: prisma as any, youtube, channelId: "UC1" });
    expect(r).toEqual({ total: 2, updated: 2 });
    const a = prisma.rows.get("aaaaaaaaaaa");
    expect(a.views).toBe(59);
    expect(a.durationSec).toBe(274);
    expect(a.isShort).toBe(false);
    expect(a.scores.title).toBeGreaterThan(0);
    const b = prisma.rows.get("bbbbbbbbbbb");
    expect(b.isShort).toBe(true);
    expect(b.privacy).toBe("private");
  });
});

describe("rankCheck", () => {
  test("finds our video's position for the English half of the title, null when absent", async () => {
    const prisma = fakePrisma();
    prisma.rows.set("aaaaaaaaaaa", { videoId: "aaaaaaaaaaa", title: "రాచమల్లు ఫైర్ | Rachamallu Proddatur News" });
    const dfs = { youtubeSerp: async (q: string) => [{ rank: 1, url: "https://www.youtube.com/watch?v=zzz" }, { rank: 2, url: "https://www.youtube.com/watch?v=yyy" }, { rank: 3, url: `https://www.youtube.com/watch?v=aaaaaaaaaaa&q=${encodeURIComponent(q)}` }] } as any;
    const r = await rankCheck({ prisma: prisma as any, dfs }, "aaaaaaaaaaa");
    expect(r).toEqual({ rank: 3, query: "Rachamallu Proddatur News" });
    expect(prisma.rows.get("aaaaaaaaaaa").rank).toBe(3);
    const none = { youtubeSerp: async () => [{ rank: 1, url: "https://www.youtube.com/watch?v=zzz" }] } as any;
    expect((await rankCheck({ prisma: prisma as any, dfs: none }, "aaaaaaaaaaa")).rank).toBeNull();
  });
});
