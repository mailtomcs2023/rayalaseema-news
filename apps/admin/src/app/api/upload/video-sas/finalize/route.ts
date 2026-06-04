// POST /api/upload/video-sas/finalize { blobUrl, contentId?, role?, sizeBytes?, mimeType? }
//
// Companion to POST /api/upload/video-sas — that issues a short-lived
// write-only SAS so the browser can stream a video file directly to
// Azure Blob without going through the Next server (videos are too
// large to route through here). After the client's PUT succeeds, it
// calls this finalize endpoint so the SharePoint mirror can be queued
// with the right article context + role. Without this, videos would
// land in Azure Blob but never make it into SP / MediaMirror.
//
// We don't re-verify the upload — the blob URL is the source of truth
// and queueMirror() fetches it back when running the mirror task.

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { queueMirror, type MirrorRole } from "@/lib/sharepoint";

const VALID_VIDEO_ROLES = new Set<MirrorRole>(["video", "thumb"]);

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;

  try {
    const body = await req.json();
    const { blobUrl, contentId, role, sizeBytes, mimeType } = body as {
      blobUrl?: string;
      contentId?: string;
      role?: string;
      sizeBytes?: number;
      mimeType?: string;
    };
    if (!blobUrl || typeof blobUrl !== "string") {
      return NextResponse.json({ error: "blobUrl required" }, { status: 400 });
    }
    const safeRole: MirrorRole = VALID_VIDEO_ROLES.has(role as MirrorRole)
      ? (role as MirrorRole)
      : "video";

    const result = await queueMirror({
      blobUrl,
      contentId: typeof contentId === "string" ? contentId : null,
      role: safeRole,
      mimeType: mimeType || "video/mp4",
      sizeBytes: typeof sizeBytes === "number" ? sizeBytes : 0,
    });

    return NextResponse.json({ ok: true, mirrorId: result?.id || null });
  } catch (e: any) {
    return apiError(e);
  }
}
