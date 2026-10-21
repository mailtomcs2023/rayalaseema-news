import { describe, test, expect } from "bun:test";
import { pollCompetitors, breakouts } from "../../src/lib/video-iq/trending";

const FEED = (id: string, title: string, views: number, published = "2026-10-20T07:30:00+00:00") => `<feed xmlns:yt="x" xmlns:media="y">
<entry><yt:videoId>${id}</yt:videoId><title>${title}</title><published>${published}</published><media:group><media:community><media:statistics views="${views}"/></media:community></media:group></entry></feed>`;

function fakePrisma(channels: Array<{ channelId: string; name: string }>) {
  const videos = new Map<string, any>();
  return {
    videos,
    competitorChannel: { findMany: async () => channels.map((c) => ({ ...c, active: true, tier: 1 })) },
    competitorVideo: {
      findMany: async ({ where, select }: any) => {
        let rows = [...videos.values()];
        if (where?.channelId) rows = rows.filter((v) => v.channelId === where.channelId);
        if (where?.publishedAt?.gte) rows = rows.filter((v) => v.publishedAt >= where.publishedAt.gte);
        return select ? rows.map((v) => Object.fromEntries(Object.keys(select).map((k) => [k, v[k]]))) : rows;
      },
      findUnique: async ({ where }: any) => videos.get(where.videoId) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const cur = videos.get(where.videoId);
        videos.set(where.videoId, cur ? { ...cur, ...update } : { videoId: where.videoId, ...create });
        return videos.get(where.videoId);
      },
      update: async ({ where, data }: any) => { Object.assign(videos.get(where.videoId), data); },
    },
  };
}

const now = () => new Date("2026-10-20T09:30:00Z");

describe("pollCompetitors", () => {
  test("stores new videos with velocity, towns and topic key; enriches duration via the API", async () => {
    const prisma = fakePrisma([{ channelId: "UC1", name: "Sakshi TV" }]);
    const fetchImpl = (async () => new Response(FEED("abcdefghijk", "Rachamallu Siva Prasad Reddy Fires In Proddatur", 1200))) as any;
    const youtube = { getVideos: async () => ({ items: [{ id: "abcdefghijk", contentDetails: { duration: "PT1M20S" }, snippet: { thumbnails: { maxres: { width: 1280, height: 720 } } }, statistics: { viewCount: "1300" } }] }) };
    const r = await pollCompetitors({ prisma: prisma as any, fetchImpl, youtube, now });
    expect(r).toEqual({ channels: 1, newVideos: 1 });
    const v = prisma.videos.get("abcdefghijk");
    expect(v.velocity).toBe(600);
    expect(v.towns).toEqual(["Proddatur"]);
    expect(v.topicKey).toContain("rachamallu siva prasad reddy");
    expect(v.durationSec).toBe(80);
    expect(v.isShort).toBe(false);
    expect(v.views).toBe(1300);
  });

  test("a second poll updates views and snapshots without counting the video as new", async () => {
    const prisma = fakePrisma([{ channelId: "UC1", name: "Sakshi TV" }]);
    let views = 1000;
    const fetchImpl = (async () => new Response(FEED("abcdefghijk", "Kurnool Bus Accident", views))) as any;
    await pollCompetitors({ prisma: prisma as any, fetchImpl, youtube: null, now });
    views = 5000;
    const r = await pollCompetitors({ prisma: prisma as any, fetchImpl, youtube: null, now: () => new Date("2026-10-20T10:30:00Z") });
    expect(r.newVideos).toBe(0);
    const v = prisma.videos.get("abcdefghijk");
    expect(v.views).toBe(5000);
    expect(v.viewSnapshots.length).toBe(2);
  });

  test("a feed that fails to load is skipped, the rest still poll", async () => {
    const prisma = fakePrisma([{ channelId: "UCBAD", name: "Down" }, { channelId: "UC1", name: "Sakshi TV" }]);
    const fetchImpl = (async (url: string) => (url.includes("UCBAD") ? new Response("", { status: 503 }) : new Response(FEED("abcdefghijk", "Kadapa Murder", 10)))) as any;
    const r = await pollCompetitors({ prisma: prisma as any, fetchImpl, youtube: null, now });
    expect(r).toEqual({ channels: 2, newVideos: 1 });
  });
});

describe("breakouts", () => {
  test("three channels on one local topic within the hour is a breakout", async () => {
    const prisma = fakePrisma([]);
    for (const [id, ch] of [["a", "UC1"], ["b", "UC2"], ["c", "UC3"]] as const) {
      prisma.videos.set(id, { videoId: id, channelId: ch, title: "Rachamallu Proddatur", publishedAt: new Date("2026-10-20T09:00:00Z"), towns: ["Proddatur"], topicKey: "proddatur+rachamallu siva prasad reddy", outlier: 1 });
    }
    prisma.videos.set("d", { videoId: "d", channelId: "UC1", title: "Delhi Smog", publishedAt: new Date("2026-10-20T09:00:00Z"), towns: [], topicKey: "delhi+smog", outlier: 20 });
    const b = await breakouts(prisma as any, now());
    expect(b.length).toBe(1);
    expect(b[0].topicKey).toBe("proddatur+rachamallu siva prasad reddy");
    expect(b[0].channels).toBe(3);
    expect(b[0].towns).toEqual(["Proddatur"]);
  });
  test("a 10x outlier with a town is a breakout even from one channel", async () => {
    const prisma = fakePrisma([]);
    prisma.videos.set("x", { videoId: "x", channelId: "UC1", title: "Tirupati Stampede", publishedAt: new Date("2026-10-20T09:00:00Z"), towns: ["Tirupati"], topicKey: "stampede+tirupati", outlier: 12 });
    const b = await breakouts(prisma as any, now());
    expect(b.map((x) => x.topicKey)).toEqual(["stampede+tirupati"]);
  });
});
