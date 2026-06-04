import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { uploadBuffer, blobConfigured } from "@/lib/blob";
import { processImageBuffer } from "@/lib/image-process";
import { queueMirror, type MirrorRole } from "@/lib/sharepoint";

const VALID_ROLES = new Set<MirrorRole>(["cover", "body", "gallery", "thumb", "video"]);

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;

  if (!blobConfigured()) {
    return NextResponse.json({ error: "AZURE_STORAGE_CONNECTION_STRING not configured" }, { status: 503 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    if (!EXT_BY_TYPE[file.type]) {
      return NextResponse.json({ error: "Only JPEG, PNG, WebP, GIF, AVIF allowed" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const inBuf: Buffer = Buffer.from(await file.arrayBuffer());

    // Strip EXIF (GPS / camera body / original photographer) + stamp our
    // copyright + force orientation upright. GIFs skip processing - sharp
    // would collapse the animation to a single frame.
    let outBuf: Buffer = inBuf;
    let outCt: string = file.type;
    let outExt: string = EXT_BY_TYPE[file.type];
    let origWidth = 0;
    if (file.type !== "image/gif") {
      try {
        const p = await processImageBuffer(inBuf);
        outBuf = p.buffer;
        outCt = p.contentType;
        outExt = p.ext;
        origWidth = p.origWidth;
      } catch (e) {
        console.warn("[upload] processImageBuffer failed, uploading raw:", e);
      }
    }
    const url = await uploadBuffer(outBuf, outExt, outCt);

    // Mirror to SharePoint (fire-and-forget). Pulls optional contentId +
    // role from the form so the file lands under the right article +
    // slug-prefixed filename. Skipped silently if SP env not configured.
    const contentId = (formData.get("contentId") as string | null) || null;
    const roleRaw = (formData.get("role") as string | null) || "body";
    const role: MirrorRole = VALID_ROLES.has(roleRaw as MirrorRole)
      ? (roleRaw as MirrorRole)
      : "body";
    void queueMirror({
      blobUrl: url,
      contentId,
      role,
      mimeType: outCt,
      sizeBytes: outBuf.length,
    }).catch((e) => console.warn("[upload] sp mirror enqueue failed:", e));

    // Low-resolution warning (don't block) - a small image looks blurry shown
    // large. 800px is the floor for a featured/hero image.
    const lowRes = origWidth > 0 && origWidth < 800;
    return NextResponse.json({
      url,
      size: outBuf.length,
      width: origWidth,
      ...(lowRes
        ? { warning: `This image is only ${origWidth}px wide and may look blurry when published. Use an image at least 800px wide, or click Upscale to enlarge it.` }
        : {}),
    });
  } catch (error) {
    return apiError(error);
  }
}
