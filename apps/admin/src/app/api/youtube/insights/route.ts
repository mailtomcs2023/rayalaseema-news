import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { getYouTube, youtubeConfigured } from "@/lib/video-iq/youtube";

// GET /api/youtube/insights → last-28-day channel totals + traffic sources
// (YouTube Analytics API v2, no Data API quota). Cached in memory for 1 hour.

type Insights = {
  from: string; to: string;
  totals: { views: number; minutesWatched: number; subscribersGained: number; subscribersLost: number };
  sources: Array<{ source: string; views: number; share: number }>;
  channel: { subscribers: number; videos: number; views: number } | null;
  fetchedAt: string;
};

let cache: { at: number; data: Insights } | null = null;
const TTL = 60 * 60_000;
const LABELS: Record<string, string> = { SHORTS: "Shorts feed", SUBSCRIBER: "Subscriptions", YT_SEARCH: "YouTube search", RELATED_VIDEO: "Suggested", YT_CHANNEL: "Channel page", EXT_URL: "External", NO_LINK_OTHER: "Direct / unknown", PLAYLIST: "Playlists", NOTIFICATION: "Notifications", YT_OTHER_PAGE: "Other YouTube", END_SCREEN: "End screens", HASHTAGS: "Hashtags", ADVERTISING: "Ads", CAMPAIGN_CARD: "Cards" };

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.data);
  if (!youtubeConfigured()) return NextResponse.json({ error: "YouTube credentials not configured on server" }, { status: 503 });
  try {
    const yt = getYouTube(prisma);
    const to = new Date();
    const from = new Date(to.getTime() - 28 * 86400_000);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const base = `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${day(from)}&endDate=${day(to)}`;
    const totals = await yt.fetchJson<{ rows?: number[][] }>(`${base}&metrics=views,estimatedMinutesWatched,subscribersGained,subscribersLost`);
    const bySource = await yt.fetchJson<{ rows?: Array<[string, number]> }>(`${base}&metrics=views&dimensions=insightTrafficSourceType&sort=-views`);
    const channel = await yt.get<{ items: any[] }>("channels?part=statistics&mine=true", "channels.list").catch(() => ({ items: [] }));
    const t = totals.rows?.[0] ?? [0, 0, 0, 0];
    const totalViews = (bySource.rows ?? []).reduce((n, r) => n + Number(r[1]), 0) || 1;
    const data: Insights = {
      from: day(from), to: day(to),
      totals: { views: Number(t[0]), minutesWatched: Number(t[1]), subscribersGained: Number(t[2]), subscribersLost: Number(t[3]) },
      sources: (bySource.rows ?? []).map((r) => ({ source: LABELS[r[0]] ?? r[0], views: Number(r[1]), share: Math.round((Number(r[1]) / totalViews) * 1000) / 10 })),
      channel: channel.items?.[0]?.statistics
        ? { subscribers: Number(channel.items[0].statistics.subscriberCount ?? 0), videos: Number(channel.items[0].statistics.videoCount ?? 0), views: Number(channel.items[0].statistics.viewCount ?? 0) }
        : null,
      fetchedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (e) {
    return apiError(e);
  }
}
