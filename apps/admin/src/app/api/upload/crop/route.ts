// Server-side image crop. The browser sends the SOURCE image + the selected
// region in NATURAL pixels; sharp.extract() cuts exactly that region, then the
// usual EXIF-strip + re-brand + resize pipeline runs and the result is uploaded
// to Azure Blob. Returns the hosted URL.
//
// Why server-side (vs the old canvas.toDataURL in the browser):
//   - No canvas tainting / SecurityError when the source is cross-origin.
//   - No multi-MB base64 round-trip through the JSON body.
//   - The output is EXACTLY the cropped region at its true aspect ratio - no
//     fixed/hardcoded ratio anywhere in the path.
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { uploadBuffer, blobConfigured } from "@/lib/blob";
import { processImageBuffer } from "@/lib/image-process";

// Load the source image into a Buffer. Accepts a data: URL (freshly pasted /
// canvas image not yet hosted) or an http(s) URL (our Azure blob, or any
// reachable image).
async function loadSource(src: string): Promise<Buffer> {
  if (src.startsWith("data:")) {
    const base64 = src.split(",")[1] || "";
    const buf = Buffer.from(base64, "base64");
    if (buf.length === 0) throw new Error("Empty image data");
    return buf;
  }
  const res = await fetch(src, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Couldn't load the source image (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("Source image is empty");
  if (buf.length > 25 * 1024 * 1024) throw new Error("Source image too large to crop (>25 MB)");
  return buf;
}

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;

  if (!blobConfigured()) {
    return NextResponse.json({ error: "AZURE_STORAGE_CONNECTION_STRING not configured" }, { status: 503 });
  }

  try {
    const { src, x, y, width, height } = await req.json();
    if (typeof src !== "string" || !src) {
      return NextResponse.json({ error: "Source image is required" }, { status: 400 });
    }
    if ([x, y, width, height].some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      return NextResponse.json({ error: "Crop region must be numeric" }, { status: 400 });
    }
    if (width < 1 || height < 1) {
      return NextResponse.json({ error: "Crop area is too small" }, { status: 400 });
    }

    const inBuf = await loadSource(src);

    // .rotate() bakes in EXIF orientation so the crop coordinates (taken from
    // the browser-rendered, already-upright image) line up with the pixels.
    const upright = await sharp(inBuf).rotate().toBuffer();
    const meta = await sharp(upright).metadata();
    const imgW = meta.width ?? 0;
    const imgH = meta.height ?? 0;
    if (!imgW || !imgH) {
      return NextResponse.json({ error: "Could not read the source image dimensions" }, { status: 400 });
    }

    // Clamp the region inside the image - rounding can push the right/bottom
    // edge 1px past the bounds, which makes sharp.extract throw.
    const left = Math.max(0, Math.min(Math.round(x), imgW - 1));
    const top = Math.max(0, Math.min(Math.round(y), imgH - 1));
    const w = Math.max(1, Math.min(Math.round(width), imgW - left));
    const h = Math.max(1, Math.min(Math.round(height), imgH - top));

    const cropped = await sharp(upright).extract({ left, top, width: w, height: h }).toBuffer();

    // Reuse the standard pipeline (EXIF strip + brand + resize-to-max-width).
    const p = await processImageBuffer(cropped);
    const url = await uploadBuffer(p.buffer, p.ext, p.contentType);

    return NextResponse.json({ url, width: w, height: h });
  } catch (error) {
    return apiError(error);
  }
}
