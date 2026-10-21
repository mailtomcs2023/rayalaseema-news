import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { outlier } from "@rayalaseema/youtube";

// GET /api/youtube/catalog?tab=videos|shorts&privacy=all|public|private|unlisted&q=&sort=newest|views|opportunities|fastest
// Channel catalog cards (ChannelVideo) joined with the latest run per video.

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const q = req.nextUrl.searchParams;
    const tab = q.get("tab") === "shorts" ? "shorts" : "videos";
    const privacy = q.get("privacy") ?? "all";
    const search = (q.get("q") ?? "").trim().toLowerCase();
    const sort = q.get("sort") ?? "newest";

    const videos = await prisma.channelVideo.findMany({
      where: { isShort: tab === "shorts", ...(privacy !== "all" ? { privacy } : {}) },
      orderBy: { publishedAt: "desc" },
      take: 500,
    });
    const runs = await prisma.videoOptimization.findMany({
      where: { videoId: { in: videos.map((v) => v.videoId) } },
      orderBy: { createdAt: "desc" },
      select: { id: true, videoId: true, status: true, scores: true, chosen: true, thumbnails: true },
    });
    const latestRun = new Map<string, (typeof runs)[number]>();
    for (const r of runs) if (r.videoId && !latestRun.has(r.videoId)) latestRun.set(r.videoId, r);

    const now = Date.now();
    const history = videos.map((v) => ({ views: v.views, ageHours: (now - v.publishedAt.getTime()) / 36e5 }));
    let items = videos.map((v) => {
      const ageHours = (now - v.publishedAt.getTime()) / 36e5;
      const run = latestRun.get(v.videoId);
      const scores = (v.scores as { title?: number; content?: number } | null) ?? {};
      const runScores = (run?.scores as { thumbnail?: number; overall?: number } | null) ?? null;
      const thumbnail = run && runScores?.thumbnail != null && (run.thumbnails as any[])?.some((t) => t.renderedUrl) ? runScores.thumbnail : null;
      const lowest = Math.min(...[scores.title, scores.content, thumbnail].filter((x): x is number => typeof x === "number"));
      return {
        videoId: v.videoId,
        title: v.title,
        thumbnailUrl: (run?.chosen as any)?.thumbnailUrl ?? v.thumbnailUrl,
        publishedAt: v.publishedAt.toISOString(),
        durationSec: v.durationSec,
        isShort: v.isShort,
        privacy: v.privacy,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        viewsPerHour: Math.round(v.views / Math.max(1, ageHours)),
        outlier: Number(outlier(v.views, ageHours, history.filter((h) => h.views !== v.views || h.ageHours !== ageHours)).toFixed(1)),
        rank: v.rank,
        rankQuery: v.rankQuery,
        rankCheckedAt: v.rankCheckedAt?.toISOString() ?? null,
        scores: { title: scores.title ?? null, content: scores.content ?? null, thumbnail },
        opportunity: Number.isFinite(lowest) && lowest < 70,
        run: run ? { id: run.id, status: run.status, overall: runScores?.overall ?? null } : null,
      };
    });
    if (search) items = items.filter((i) => i.title.toLowerCase().includes(search));
    if (sort === "views") items.sort((a, b) => b.views - a.views);
    else if (sort === "fastest") items.sort((a, b) => b.viewsPerHour - a.viewsPerHour);
    else if (sort === "opportunities") items.sort((a, b) => Math.min(a.scores.title ?? 100, a.scores.content ?? 100) - Math.min(b.scores.title ?? 100, b.scores.content ?? 100));
    const lastSync = videos.reduce<Date | null>((m, v) => (!m || v.syncedAt > m ? v.syncedAt : m), null);
    return NextResponse.json({ items, total: items.length, lastSync: lastSync?.toISOString() ?? null });
  } catch (e) {
    return apiError(e);
  }
}
