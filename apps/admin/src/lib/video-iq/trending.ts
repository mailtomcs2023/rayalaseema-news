// Trending desk poller (spec 12.11). Every 15 minutes: read each watched
// channel's Atom feed (no quota), upsert videos with velocity, outlier
// ratio, towns and topic key, then enrich NEW videos with duration and
// aspect through videos.list (1 unit per 50 ids).
import { classifyFormat, parseYouTubeRss, outlier, topicKey, townsIn, velocity } from "@rayalaseema/youtube";

type Deps = {
  prisma: any;
  fetchImpl?: typeof fetch;
  youtube: { getVideos: (ids: string[]) => Promise<{ items: any[] }> } | null;
  now?: () => Date;
};

const FEED = (channelId: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
const HISTORY_DAYS = 30;
const MAX_SNAPSHOTS = 48;

const isoDurationSec = (iso: string) => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) ?? [];
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
};

export async function pollCompetitors(d: Deps): Promise<{ channels: number; newVideos: number }> {
  const now = (d.now ?? (() => new Date()))();
  const f = d.fetchImpl ?? fetch;
  const channels = await d.prisma.competitorChannel.findMany({ where: { active: true } });
  const fresh: string[] = [];

  for (const ch of channels) {
    const res = await f(FEED(ch.channelId), { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!res || !res.ok) continue;
    const entries = parseYouTubeRss(await res.text());
    if (!entries.length) continue;
    const history = (await d.prisma.competitorVideo.findMany({
      where: { channelId: ch.channelId, publishedAt: { gte: new Date(now.getTime() - HISTORY_DAYS * 86400_000) } },
      select: { views: true, publishedAt: true },
    })).map((h: { views: number; publishedAt: Date }) => ({ views: h.views, ageHours: (now.getTime() - new Date(h.publishedAt).getTime()) / 36e5 }));

    for (const v of entries) {
      const publishedAt = new Date(v.publishedAt);
      const ageHours = (now.getTime() - publishedAt.getTime()) / 36e5;
      const existing = await d.prisma.competitorVideo.findUnique({ where: { videoId: v.videoId } });
      const snapshots = [...((existing?.viewSnapshots as Array<{ at: string; views: number }> | null) ?? []), { at: now.toISOString(), views: v.views }].slice(-MAX_SNAPSHOTS);
      const data = {
        channelId: ch.channelId,
        title: v.title,
        publishedAt,
        views: v.views,
        viewSnapshots: snapshots,
        velocity: velocity(v.views, publishedAt, now),
        outlier: outlier(v.views, ageHours, history),
        towns: townsIn(v.title).map((p) => p.en),
        topicKey: topicKey(v.title),
        fetchedAt: now,
      };
      await d.prisma.competitorVideo.upsert({ where: { videoId: v.videoId }, create: { videoId: v.videoId, ...data }, update: data });
      if (!existing) fresh.push(v.videoId);
    }
  }

  if (d.youtube && fresh.length) {
    for (let i = 0; i < fresh.length; i += 50) {
      const { items } = await d.youtube.getVideos(fresh.slice(i, i + 50)).catch(() => ({ items: [] as any[] }));
      for (const it of items ?? []) {
        const durationSec = isoDurationSec(it.contentDetails?.duration ?? "");
        const t = it.snippet?.thumbnails?.maxres ?? it.snippet?.thumbnails?.high;
        await d.prisma.competitorVideo.update({
          where: { videoId: it.id },
          data: {
            durationSec,
            isShort: classifyFormat({ durationSec, width: t?.width, height: t?.height }) === "SHORT",
            ...(it.statistics?.viewCount != null ? { views: Number(it.statistics.viewCount) } : {}),
          },
        });
      }
    }
  }
  return { channels: channels.length, newVideos: fresh.length };
}

export type Breakout = { topicKey: string; channels: number; towns: string[]; sample: string };

/** Local story on 3+ channels in the last hour, or a 10x outlier with a town. */
export async function breakouts(prisma: any, now = new Date()): Promise<Breakout[]> {
  const since = new Date(now.getTime() - 3600_000);
  const rows: Array<{ topicKey: string | null; channelId: string; towns: string[]; title: string; outlier: number }> = await prisma.competitorVideo.findMany({
    where: { publishedAt: { gte: since } },
    select: { topicKey: true, channelId: true, towns: true, title: true, outlier: true },
  });
  const byTopic = new Map<string, typeof rows>();
  for (const r of rows) if (r.topicKey) byTopic.set(r.topicKey, [...(byTopic.get(r.topicKey) ?? []), r]);
  const out: Breakout[] = [];
  for (const [key, vids] of byTopic) {
    const channels = new Set(vids.map((v) => v.channelId)).size;
    const towns = [...new Set(vids.flatMap((v) => v.towns))];
    const spike = vids.some((v) => v.outlier >= 10 && v.towns.length > 0);
    if ((channels >= 3 && towns.length > 0) || spike) out.push({ topicKey: key, channels, towns, sample: vids[0].title });
  }
  return out.sort((a, b) => b.channels - a.channels);
}
