// Our channel's catalog (spec 2026-10-22 §3.1): sync from the Data API,
// deterministic scores on the live metadata, and an on-demand rank check.
import { classifyFormat, peopleIn, scoreDescription, scoreTags, scoreTitle, splitTitle, townsIn } from "@rayalaseema/youtube";

export type CatalogScores = { title: number; content: number };

export function catalogScores(v: { title: string; description: string; tags: string[] }): CatalogScores {
  const entities = {
    people: peopleIn(v.title).map((p) => p.en),
    places: townsIn(v.title).map((p) => p.en),
    parties: [],
    topics: [],
  };
  const title = scoreTitle(v.title, { entities, breaking: /బ్రేకింగ్|breaking/i.test(v.title), volumes: new Map() });
  const content = Math.round((scoreDescription(v.description ?? "") + scoreTags(v.tags ?? [])) / 2);
  return { title, content };
}

const isoDurationSec = (iso: string) => {
  const m = (iso ?? "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) ?? [];
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
};

type SyncYouTube = { listUploadsAll: (channelId: string, max?: number) => Promise<string[]>; getVideos: (ids: string[]) => Promise<{ items: any[] }> };

export async function syncChannel(d: { prisma: any; youtube: SyncYouTube; channelId: string; now?: () => Date }): Promise<{ total: number; updated: number }> {
  const now = (d.now ?? (() => new Date()))();
  const ids = await d.youtube.listUploadsAll(d.channelId, 500);
  let updated = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const { items } = await d.youtube.getVideos(ids.slice(i, i + 50));
    for (const it of items ?? []) {
      const s = it.snippet ?? {};
      const durationSec = isoDurationSec(it.contentDetails?.duration);
      const t = s.thumbnails?.maxres ?? s.thumbnails?.high ?? s.thumbnails?.medium;
      const data = {
        title: String(s.title ?? ""),
        description: String(s.description ?? ""),
        tags: Array.isArray(s.tags) ? s.tags : [],
        publishedAt: new Date(s.publishedAt ?? now),
        durationSec,
        isShort: classifyFormat({ durationSec, width: t?.width, height: t?.height }) === "SHORT",
        privacy: String(it.status?.privacyStatus ?? "public"),
        views: Number(it.statistics?.viewCount ?? 0),
        likes: Number(it.statistics?.likeCount ?? 0),
        comments: Number(it.statistics?.commentCount ?? 0),
        thumbnailUrl: t?.url ?? null,
        categoryId: s.categoryId ?? null,
        scores: catalogScores({ title: String(s.title ?? ""), description: String(s.description ?? ""), tags: Array.isArray(s.tags) ? s.tags : [] }),
        syncedAt: now,
      };
      await d.prisma.channelVideo.upsert({ where: { videoId: it.id }, create: { videoId: it.id, ...data }, update: data });
      updated++;
    }
  }
  return { total: ids.length, updated };
}

/** Where our video ranks on YouTube for the English half of its title (DataForSEO SERP, 1 call). */
export async function rankCheck(d: { prisma: any; dfs: { youtubeSerp: (q: string) => Promise<Array<{ rank: number; url: string }>> }; now?: () => Date }, videoId: string): Promise<{ rank: number | null; query: string }> {
  const row = await d.prisma.channelVideo.findUnique({ where: { videoId } });
  if (!row) throw new Error("video not in catalog");
  const query = (splitTitle(row.title).english || row.title).trim();
  const hits = await d.dfs.youtubeSerp(query);
  const hit = hits.find((h) => h.url.includes(videoId));
  const rank = hit ? hit.rank : null;
  await d.prisma.channelVideo.update({ where: { videoId }, data: { rank, rankQuery: query, rankCheckedAt: (d.now ?? (() => new Date()))() } });
  return { rank, query };
}
