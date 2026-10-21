import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { titlePatterns, isLiveTitle } from "@/lib/video-iq/story-draft";

// GET /api/trending?window=6h|24h|7d&kind=all|short|long&local=1&live=1&sort=velocity|outlier
// Competitor videos from the trending desk plus topic clusters (spec 12.11).

const WINDOW_MS: Record<string, number> = { "6h": 6 * 3600_000, "24h": 24 * 3600_000, "7d": 7 * 86400_000 };

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const q = req.nextUrl.searchParams;
    const since = new Date(Date.now() - (WINDOW_MS[q.get("window") ?? "24h"] ?? WINDOW_MS["24h"]));
    const kind = q.get("kind") ?? "all";
    const local = q.get("local") === "1";
    const includeLive = q.get("live") === "1";
    const sort = q.get("sort") === "outlier" ? "outlier" : "velocity";

    const rows = await prisma.competitorVideo.findMany({
      where: {
        publishedAt: { gte: since },
        ...(kind === "short" ? { isShort: true } : kind === "long" ? { isShort: false } : {}),
        ...(local ? { NOT: { towns: { isEmpty: true } } } : {}),
      },
      orderBy: { [sort]: "desc" },
      take: 300,
      include: { channel: { select: { name: true, tier: true } } },
    });
    const items = (includeLive ? rows : rows.filter((r) => !isLiveTitle(r.title))).slice(0, 100);

    const byTopic = new Map<string, typeof rows>();
    for (const r of rows) if (r.topicKey && !isLiveTitle(r.title)) byTopic.set(r.topicKey, [...(byTopic.get(r.topicKey) ?? []), r]);
    const clusters = [...byTopic]
      .map(([topicKey, vids]) => ({
        topicKey,
        channels: new Set(vids.map((v) => v.channelId)).size,
        towns: [...new Set(vids.flatMap((v) => v.towns))],
        views: vids.reduce((n, v) => n + v.views, 0),
        titles: vids.slice(0, 5).map((v) => v.title),
        videoIds: vids.map((v) => v.videoId),
        patterns: titlePatterns(vids.map((v) => v.title)),
      }))
      .filter((c) => c.channels >= 2 || c.towns.length)
      .sort((a, b) => b.channels - a.channels || b.views - a.views)
      .slice(0, 40);

    return NextResponse.json({ items, clusters, since });
  } catch (e) {
    return apiError(e);
  }
}
