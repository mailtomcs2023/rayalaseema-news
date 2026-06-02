// POST /api/upload/video-sas { contentType, size }
//
// Returns a short-lived, write-only SAS URL so the browser can upload a video
// file DIRECTLY to Azure Blob (videos are too large to route through the Next
// server). The client PUTs the file to `uploadUrl`, then stores `blobUrl` as
// the video's URL. MP4 / WebM only, 100 MB cap. No transcoding (the prod VM is
// too small) - long video should use a YouTube/hosted URL instead.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-utils";
import { videoUploadSas, blobConfigured } from "@/lib/blob";

const ALLOWED: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };
const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  if (!blobConfigured()) {
    return NextResponse.json({ error: "Video storage isn't set up yet. Please contact your administrator." }, { status: 503 });
  }

  const { contentType, size } = await req.json().catch(() => ({}));
  const ext = ALLOWED[contentType as string];
  if (!ext) {
    return NextResponse.json(
      { error: "Only MP4 or WebM videos can be uploaded. Convert the file, or paste a YouTube/hosted URL instead." },
      { status: 400 },
    );
  }
  if (typeof size === "number" && size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Video is too large (${Math.round(size / 1024 / 1024)} MB). Max is 100 MB - for longer video, paste a YouTube/hosted URL instead.` },
      { status: 400 },
    );
  }

  const sas = videoUploadSas(ext, contentType);
  if (!sas) {
    return NextResponse.json({ error: "Couldn't create the upload link. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ uploadUrl: sas.uploadUrl, blobUrl: sas.blobUrl, maxBytes: MAX_BYTES });
}
