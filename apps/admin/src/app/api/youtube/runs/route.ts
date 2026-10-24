import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { runInputSchema, runSummary, youtubeIdFrom } from "@/lib/video-iq/studio";
import { ACTIVE_STATUSES, processQueue } from "@/lib/video-iq/worker";
import { buildDeps } from "@/lib/video-iq/deps";
import { CHANNEL_ID, getYouTube, youtubeConfigured } from "@/lib/video-iq/youtube";

// POST /api/youtube/runs            → create a standalone run (upload or back-catalog video)
// GET  /api/youtube/runs?status=    → run cards for the studio (all | active | ready | published | failed)
//                        ?videoId=  → the latest run for one YouTube id

export async function POST(req: NextRequest) {
  const auth = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(auth)) return auth;
  try {
    const parsed = runInputSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
    }
    const input = parsed.data;
    let videoId: string | null = null;
    let deskTitle = input.deskTitle;

    if (input.source === "youtube") {
      videoId = youtubeIdFrom(input.videoUrl!);
      if (!youtubeConfigured()) return NextResponse.json({ error: "YouTube credentials not configured on server" }, { status: 503 });
      const { items } = await getYouTube(prisma).getVideos([videoId!]);
      const v = items?.[0];
      if (!v) return NextResponse.json({ error: "video not found on YouTube" }, { status: 400 });
      if (v.snippet?.channelId !== CHANNEL_ID) return NextResponse.json({ error: "that video is not on our channel" }, { status: 400 });
      deskTitle ||= String(v.snippet?.title ?? "");
    }

    const dup = await prisma.videoOptimization.findFirst({
      where: { status: { in: [...ACTIVE_STATUSES] }, ...(videoId ? { videoId } : { blobUrl: input.blobUrl }) },
      select: { id: true, status: true },
    });
    if (dup) return NextResponse.json({ error: `a run for this video is already in progress (${dup.status.toLowerCase()})`, id: dup.id }, { status: 409 });

    const row = await prisma.videoOptimization.create({
      data: {
        source: videoId ? "YOUTUBE" : "BLOB",
        blobUrl: videoId ? null : input.blobUrl,
        videoId,
        deskTitle,
        deskNotes: input.deskNotes || null,
        breaking: input.breaking,
        district: input.district || null,
        visibility: input.visibility,
        publishAt: input.visibility === "scheduled" && input.publishAt ? new Date(input.publishAt) : null,
        createdById: auth.user.id,
      },
    });
    await logAudit({ action: "youtube.run.create", resource: "video_optimization", resourceId: row.id, meta: { source: row.source, videoId, visibility: input.visibility }, actor: auth.user, req });
    // Start working right away (after the response is sent); the PM2 cron
    // runner is the fallback if this request's process goes away.
    after(async () => { try { await processQueue(buildDeps(), 1); } catch (e) { console.error("[video-iq] start kick", e); } });
    return NextResponse.json({ id: row.id, status: row.status }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}

const STATUS_FILTER: Record<string, string[]> = {
  active: [...ACTIVE_STATUSES, "PUBLISHING"],
  ready: ["READY", "APPROVED"],
  published: ["APPLIED"],
  failed: ["FAILED"],
};

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const q = req.nextUrl.searchParams;
    const videoId = q.get("videoId");
    if (videoId) {
      const row = await prisma.videoOptimization.findFirst({ where: { videoId }, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } });
      return row ? NextResponse.json(runSummary(row)) : new NextResponse(null, { status: 204 });
    }
    const status = q.get("status") ?? "all";
    const rows = await prisma.videoOptimization.findMany({
      where: STATUS_FILTER[status] ? { status: { in: STATUS_FILTER[status] as any } } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json({ items: rows.map(runSummary) });
  } catch (e) {
    return apiError(e);
  }
}
