import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { pingWebRevalidate } from "@/lib/revalidate-web";
import { getYouTube, youtubeConfigured, youtubeDryRun } from "@/lib/video-iq/youtube";
import { QuotaBudgetError } from "@/lib/video-iq/quota";
import { publishOptimization } from "@/lib/video-iq/publish";
import { SITE } from "@/lib/video-iq/chosen";

// POST /api/video-iq/[id]/publish
// Writes the approved run to YouTube. ~1,900 units for a new upload, ~250
// for a back-catalog update. 429 when today's quota budget would be exceeded.

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 300;

async function fetchBlob(url: string): Promise<{ bytes: Uint8Array; size: number }> {
  const r = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!r.ok) throw new Error(`fetch ${r.status} for ${url.split("?")[0]}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { bytes, size: bytes.byteLength };
}

// The video sitemap carries the YouTube id in <video:thumbnail_loc>; when the
// page already exists it is the canonical article URL for the description.
async function sitemapUrlFor(videoId: string | null, slug: string | null): Promise<string | null> {
  try {
    const xml = await fetch(`${SITE}/video-sitemap.xml`, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.text() : ""));
    for (const block of xml.split("<url>").slice(1)) {
      const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
      if (!loc) continue;
      if ((videoId && block.includes(`/vi/${videoId}/`)) || (slug && loc.endsWith(`/videos/${slug}`))) return loc;
    }
  } catch {
    // sitemap unreachable: treat as no page
  }
  return null;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(auth)) return auth;
  const { id } = await ctx.params;
  if (!youtubeConfigured()) return NextResponse.json({ error: "YouTube credentials not configured on server" }, { status: 503 });
  try {
    const result = await publishOptimization(id, { prisma, youtube: getYouTube(prisma), fetchBlob, sitemapUrlFor });
    const run = await prisma.videoOptimization.findUnique({ where: { id }, select: { contentId: true, content: { select: { slug: true } } } });
    await logAudit({ action: "video_iq.publish", resource: "content", resourceId: run?.contentId, meta: { runId: id, videoId: result.videoId, warnings: result.warnings, dryRun: youtubeDryRun() }, actor: auth.user, req });
    if (run?.content?.slug) pingWebRevalidate([`/videos/${run.content.slug}`]);
    return NextResponse.json({ videoId: result.videoId, url: `https://www.youtube.com/watch?v=${result.videoId}`, warnings: result.warnings, dryRun: youtubeDryRun() });
  } catch (e) {
    if (e instanceof QuotaBudgetError) return NextResponse.json({ error: e.message }, { status: 429 });
    await prisma.videoOptimization.update({ where: { id }, data: { status: "FAILED", error: String((e as Error).message).slice(0, 2000) } }).catch(() => {});
    return apiError(e);
  }
}
