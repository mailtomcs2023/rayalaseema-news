// Image post-processing: strip third-party EXIF (GPS, camera body, original
// photographer name), force orientation upright, and stamp our own copyright /
// artist tags. Used by every image that lands on the public site so a leaked
// EXIF GPS location can't reveal a stringer's whereabouts.
import sharp from "sharp";

const BRAND = "© Rayalaseema Express";
const ARTIST = "Rayalaseema Express";

export interface ProcessOpts {
  // Output max width — keeps featured images sane (Azure egress costs).
  maxWidth?: number;
  // Force JPEG output (smaller than PNG for photos). PNG kept only if source
  // had transparency.
  quality?: number;
}

export async function processImageBuffer(
  input: Buffer,
  opts: ProcessOpts = {},
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  const maxWidth = opts.maxWidth ?? 1600;
  const quality = opts.quality ?? 85;

  // .rotate() applies the EXIF orientation tag THEN removes the tag itself,
  // which means we can safely drop the rest of the metadata afterwards
  // without flipping portraits sideways.
  let pipeline = sharp(input).rotate();
  const meta = await pipeline.metadata();

  // Resize if wider than target. height = null preserves aspect ratio.
  if (meta.width && meta.width > maxWidth) {
    pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  }

  const hasAlpha = !!meta.hasAlpha;
  if (hasAlpha) {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else {
    pipeline = pipeline.jpeg({ quality, mozjpeg: true });
  }

  // withExif stamps only the tags we want; everything else (GPS, camera
  // serial, original photographer) is dropped.
  pipeline = pipeline.withExif({
    IFD0: {
      Copyright: BRAND,
      Artist: ARTIST,
      Software: "Rayalaseema Express CMS",
    },
  });

  const buffer = await pipeline.toBuffer();
  return hasAlpha
    ? { buffer, contentType: "image/png", ext: "png" }
    : { buffer, contentType: "image/jpeg", ext: "jpg" };
}

// Convenience: download an external URL, then process. Returns raw buffer +
// content-type so the caller can upload via lib/blob.uploadBuffer.
export async function downloadAndProcess(url: string, opts: ProcessOpts = {}) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "image/*",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Source returned ${res.status}`);
  const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ct.startsWith("image/")) throw new Error(`Source returned content-type "${ct}"`);
  const inBuf = Buffer.from(await res.arrayBuffer());
  if (inBuf.length === 0) throw new Error("Empty image body");
  if (inBuf.length > 12 * 1024 * 1024) throw new Error("Source image >12 MB, refusing");
  return processImageBuffer(inBuf, opts);
}
