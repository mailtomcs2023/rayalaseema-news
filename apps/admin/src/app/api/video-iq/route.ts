import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { activeRunExists } from "@/lib/video-iq/worker";

// POST /api/video-iq { contentId }  → queue an optimisation run for a VIDEO/REEL
// GET  /api/video-iq?contentId=     → latest run for that content (204 when none)

const YT_ID = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const BLOB_HOST = /\.blob\.core\.windows\.net\//;

export async function POST(req: NextRequest) {
  const auth = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(auth)) return auth;
  try {
    const body = await req.json().catch(() => ({}));
    const contentId = typeof body.contentId === "string" ? body.contentId : "";
    if (!contentId) return NextResponse.json({ error: "contentId required" }, { status: 400 });

    const c = await prisma.content.findUnique({ where: { id: contentId }, select: { id: true, type: true, payload: true } });
    if (!c || (c.type !== "VIDEO" && c.type !== "REEL")) {
      return NextResponse.json({ error: "content is not a video" }, { status: 400 });
    }
    const p = (c.payload ?? {}) as Record<string, unknown>;
    const url = String(p.videoUrl || p.clipUrl || "");
    const videoId: string | null = typeof p.videoId === "string" ? p.videoId : (url.match(YT_ID)?.[1] ?? null);
    const source = videoId ? "YOUTUBE" : "BLOB";
    if (source === "BLOB" && !BLOB_HOST.test(url)) {
      return NextResponse.json({ error: "video must be uploaded to blob storage or be a YouTube URL" }, { status: 400 });
    }

    const active = await activeRunExists(prisma, contentId);
    if (active) {
      return NextResponse.json({ error: `a run is already in progress (${active.status.toLowerCase()}); wait for it to finish`, id: active.id }, { status: 409 });
    }

    const row = await prisma.videoOptimization.create({
      data: { contentId, source, blobUrl: source === "BLOB" ? url : null, videoId, createdById: auth.user.id },
    });
    await logAudit({ action: "video_iq.queue", resource: "content", resourceId: contentId, meta: { runId: row.id, source }, actor: auth.user, req });
    return NextResponse.json({ id: row.id, status: row.status }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const contentId = req.nextUrl.searchParams.get("contentId") || "";
  if (!contentId) return NextResponse.json({ error: "contentId required" }, { status: 400 });
  const row = await prisma.videoOptimization.findFirst({ where: { contentId }, orderBy: { createdAt: "desc" } });
  if (!row) return new NextResponse(null, { status: 204 });
  return NextResponse.json(row);
}
