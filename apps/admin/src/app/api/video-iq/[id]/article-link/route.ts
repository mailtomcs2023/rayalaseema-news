import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { SITE } from "@/lib/video-iq/chosen";
import { descriptionWithArticleLink } from "@/lib/video-iq/studio";
import { getYouTube, youtubeConfigured } from "@/lib/video-iq/youtube";
import { classifyPublishError } from "@/lib/video-iq/publish";

// POST /api/video-iq/[id]/article-link
// Once the linked website article is PUBLISHED, add its URL to the YouTube
// description (one videos.update, 50 units). Idempotent.
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await ctx.params;
    const row = await prisma.videoOptimization.findUnique({ where: { id }, include: { content: { select: { slug: true, status: true } } } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (row.status !== "APPLIED" || !row.videoId) return NextResponse.json({ error: "publish the video to YouTube first" }, { status: 409 });
    if (!row.content?.slug || row.content.status !== "PUBLISHED") return NextResponse.json({ error: "publish the website article first" }, { status: 409 });
    if (!youtubeConfigured()) return NextResponse.json({ error: "YouTube credentials not configured on server" }, { status: 503 });

    const url = `${SITE}/videos/${row.content.slug}`;
    const yt = getYouTube(prisma);
    const { items } = await yt.getVideos([row.videoId]);
    const v = items?.[0];
    if (!v) return NextResponse.json({ error: "video not found on YouTube" }, { status: 404 });
    const next = descriptionWithArticleLink(String(v.snippet?.description ?? ""), url);
    if (!next) return NextResponse.json({ url, already: true });

    await yt.updateSnippetStatus(row.videoId, {
      title: v.snippet.title,
      description: next,
      tags: v.snippet.tags ?? [],
      categoryId: "25",
      defaultLanguage: "te",
      defaultAudioLanguage: "te",
    });
    const applied = { ...((row.applied as Record<string, unknown>) ?? {}), articleLink: url };
    await prisma.videoOptimization.update({ where: { id }, data: { applied } });
    await logAudit({ action: "youtube.run.article_link", resource: "video_optimization", resourceId: id, meta: { videoId: row.videoId, url }, actor: auth.user, req });
    return NextResponse.json({ url });
  } catch (e) {
    const { status } = classifyPublishError(e);
    if (status !== 500) return NextResponse.json({ error: (e as Error).message }, { status });
    return apiError(e);
  }
}
