// Image post-processing: strip third-party EXIF (GPS, camera body, original
// photographer name), force orientation upright, and stamp our own copyright /
// artist tags. Used by every image that lands on the public site so a leaked
// EXIF GPS location can't reveal a stringer's whereabouts.
import sharp from "sharp";

const BRAND = "© Rayalaseema News";
const ARTIST = "Rayalaseema News";

export interface ProcessOpts {
  // Output max width - keeps featured images sane (Azure egress costs).
  maxWidth?: number;
  // Force JPEG output (smaller than PNG for photos). PNG kept only if source
  // had transparency.
  quality?: number;
  // Skip the auto-baseline (normalize + saturation pull + sharpen).
  // Default false. Editor turns it on for intentionally moody shots
  // (candlelight vigils, sunset rallies, monochrome portraits) where
  // stretching the histogram would flatten the mood. Always-true for
  // PNG / alpha-channel sources because normalize on a transparent
  // image can produce halos around the alpha edges.
  skipBaseline?: boolean;
}

/**
 * Editorial baseline ops applied to EVERY uploaded photo so brand
 * consistency doesn't depend on a thousand reporters' phone defaults.
 *   - normalize 1-99% → stretches tonal range; lifts dark district-
 *     stringer shots to a mid-gray baseline without crushing the top
 *     1% of highlights.
 *   - modulate saturation 0.92 → dials phone-camera punch ~8% down to
 *     a documentary look (matches Eenadu/Sakshi/The Hindu's print
 *     register).
 *   - sharpen sigma 1.2 → mild unsharp-mask, the editorial standard
 *     for "newspaper photo" crispness. Heavier sharpen looks digital;
 *     lighter looks flat.
 * Together: ~80ms extra per image. Free, deterministic, idempotent
 * (re-running doesn't compound: normalize is bounded, saturation is
 * a one-shot multiplier, sharpen converges).
 */
function applyEditorialBaseline(p: sharp.Sharp): sharp.Sharp {
  return p
    .normalize({ lower: 1, upper: 99 })
    .modulate({ saturation: 0.92 })
    .sharpen({ sigma: 1.2 });
}

export async function processImageBuffer(
  input: Buffer,
  opts: ProcessOpts = {},
): Promise<{ buffer: Buffer; contentType: string; ext: string; origWidth: number; origHeight: number }> {
  const maxWidth = opts.maxWidth ?? 1600;
  // Default quality 78. News photos are mostly mid-tone JPEG-friendly
  // (faces, crowds, daylight), and at 78 we hit the WebP sweet spot:
  // ~40% smaller than 85 with no visible degradation. PSI flagged
  // /featuredImage as 137 KB at q=85; q=78 takes the same image to
  // ~85 KB without changing perceived sharpness.
  const quality = opts.quality ?? 78;

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

  // Editorial baseline runs BEFORE encoding so the histogram-stretch
  // sees the original tonal range. Skipped for alpha sources (halos
  // around the alpha edges) and when the caller opts out (rare moody
  // shots the editor wants preserved).
  if (!opts.skipBaseline && !hasAlpha) {
    pipeline = applyEditorialBaseline(pipeline);
  }

  // Output format selection. Default is WebP for opaque sources -
  // ~30% smaller than mozjpeg at the same perceived quality + browsers
  // are universal on it (96%+ market). PNG-with-alpha stays PNG so
  // transparency isn't flattened. Switched from default JPEG on
  // 2026-06-05 after PSI flagged uploaded banners as oversized PNGs.
  if (hasAlpha) {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else {
    pipeline = pipeline.webp({ quality, effort: 5 });
  }

  // withExif stamps only the tags we want; everything else (GPS, camera
  // serial, original photographer) is dropped.
  pipeline = pipeline.withExif({
    IFD0: {
      Copyright: BRAND,
      Artist: ARTIST,
      Software: "Rayalaseema News CMS",
    },
  });

  const buffer = await pipeline.toBuffer();
  // Original (pre-resize) dimensions - callers use these to flag low-res
  // images that will look blurry when shown large.
  const origWidth = meta.width ?? 0;
  const origHeight = meta.height ?? 0;
  return hasAlpha
    ? { buffer, contentType: "image/png", ext: "png", origWidth, origHeight }
    : { buffer, contentType: "image/webp", ext: "webp", origWidth, origHeight };
}

// Spec #4 E1 (#220) - multi-aspect image pipeline.
//
// Google News carousels + Top Stories prefer images at 16:9 / 4:3 / 1:1
// aspect ratios ≥ 1200×675 px. NewsArticle JSON-LD ships all three so
// crawlers + AI engines pick whichever fits the surface they render.
//
// Output variants per upload (in addition to the existing original):
//   <id>-16x9.webp / .jpg     - 1200×675 horizontal hero
//   <id>-4x3.webp  / .jpg     - 1200×900 standard news
//   <id>-1x1.webp  / .jpg     - 1200×1200 square (Instagram + Discover card)
//
// Sharp's smart-crop (.resize with position: 'attention') uses saliency
// detection so faces don't get lopped off. AVIF skipped for V1 to keep
// upload time predictable; can be added later via an opts flag.

export interface AspectVariant {
  buffer: Buffer;
  contentType: string;
  ext: string;
  width: number;
  height: number;
  aspect: "16x9" | "4x3" | "1x1";
  format: "webp" | "jpeg";
}

const ASPECTS = [
  { name: "16x9" as const, width: 1200, height: 675 },
  { name: "4x3" as const, width: 1200, height: 900 },
  { name: "1x1" as const, width: 1200, height: 1200 },
];

/**
 * Generate WebP + JPEG variants of the source image at the 3 aspect ratios
 * Google News expects. Each output is EXIF-stripped + RE-branded, just like
 * processImageBuffer's main output.
 */
export async function generateAspectVariants(input: Buffer): Promise<AspectVariant[]> {
  const out: AspectVariant[] = [];
  for (const a of ASPECTS) {
    // Same editorial baseline as processImageBuffer so 16:9 / 4:3 / 1:1
    // variants stay consistent with the main hero. Saliency-aware crop
    // (position:attention) keeps faces in frame.
    const base = applyEditorialBaseline(
      sharp(input)
        .rotate()
        .resize({ width: a.width, height: a.height, fit: "cover", position: "attention" }),
    ).withExif({ IFD0: { Copyright: BRAND, Artist: ARTIST, Software: "Rayalaseema News CMS" } });
    const [webp, jpeg] = await Promise.all([
      base.clone().webp({ quality: 75 }).toBuffer(),
      base.clone().jpeg({ quality: 78, mozjpeg: true }).toBuffer(),
    ]);
    out.push({ buffer: webp, contentType: "image/webp", ext: "webp", width: a.width, height: a.height, aspect: a.name, format: "webp" });
    out.push({ buffer: jpeg, contentType: "image/jpeg", ext: "jpg", width: a.width, height: a.height, aspect: a.name, format: "jpeg" });
  }
  return out;
}

/** Variant filename builder: `<contentId>-<aspect>.<ext>` */
export function variantFilename(contentId: string, v: AspectVariant): string {
  return `${contentId}-${v.aspect}.${v.ext}`;
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
