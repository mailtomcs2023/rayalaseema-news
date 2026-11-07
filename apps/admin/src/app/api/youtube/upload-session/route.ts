import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { getYouTube, youtubeConfigured } from "@/lib/video-iq/youtube";
import { QuotaBudgetError } from "@/lib/video-iq/quota";
import { allowedUploadOrigin, isVideoType, YT_MAX_BYTES } from "@/lib/youtube-direct-upload";

// POST /api/youtube/upload-session
//   { fileName, size, contentType, title? } -> { sessionUrl }
//
// Opens a YouTube resumable upload session (as PRIVATE) for the signed-in
// editor's browser to send the file straight to YouTube. Our servers never
// see the video bytes, so file size is bounded only by YouTube (256 GB).
// The run is created afterwards with source "youtube" and the new id.
const bodySchema = z.object({
  fileName: z.string().trim().min(1).max(300),
  size: z.number().int().positive().max(YT_MAX_BYTES),
  contentType: z.string().refine(isVideoType, "unsupported video type"),
  title: z.string().trim().max(100).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(auth)) return auth;
  try {
    const origin = allowedUploadOrigin(req.headers.get("origin"), process.env.NEXTAUTH_URL);
    if (!origin) return NextResponse.json({ error: "upload must start from the admin site" }, { status: 403 });
    if (!youtubeConfigured()) return NextResponse.json({ error: "YouTube credentials not configured on server" }, { status: 503 });

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
    }
    const b = parsed.data;
    // Placeholder title until Video IQ publishes the chosen one.
    const title = (b.title || b.fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ")).slice(0, 100).replace(/[<>]/g, "") || "Rayalaseema News";

    const sessionUrl = await getYouTube(prisma).createUploadSession({
      sizeBytes: b.size,
      contentType: b.contentType,
      origin,
      snippet: { title, description: "", tags: [], categoryId: "25", defaultLanguage: "te", defaultAudioLanguage: "te" },
      status: { privacyStatus: "private", selfDeclaredMadeForKids: false, embeddable: true, license: "youtube" },
    });
    await logAudit({ action: "youtube.upload.session", resource: "youtube_video", meta: { fileName: b.fileName, size: b.size }, actor: auth.user, req });
    return NextResponse.json({ sessionUrl });
  } catch (e) {
    if (e instanceof QuotaBudgetError) return NextResponse.json({ error: e.message }, { status: 429 });
    return apiError(e);
  }
}
