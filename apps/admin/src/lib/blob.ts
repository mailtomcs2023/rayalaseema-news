import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { processImageBuffer } from "./image-process";

// Media storage: S3-compatible object store (MinIO/Silo behind
// media.rayalaseemanews.com since the Nov-2026 move off Azure Blob).
// All config comes from env; see deploy.yml.
//   MEDIA_S3_ENDPOINT       https://media.rayalaseemanews.com
//   MEDIA_S3_REGION         us-east-1
//   MEDIA_S3_BUCKET         rsn-media
//   MEDIA_S3_ACCESS_KEY_ID / MEDIA_S3_SECRET_ACCESS_KEY  (scoped app key)
//   MEDIA_PUBLIC_BASE_URL   https://media.rayalaseemanews.com/rsn-media
const ENDPOINT = process.env.MEDIA_S3_ENDPOINT;
const REGION = process.env.MEDIA_S3_REGION || "us-east-1";
const BUCKET = process.env.MEDIA_S3_BUCKET;
const ACCESS_KEY = process.env.MEDIA_S3_ACCESS_KEY_ID;
const SECRET_KEY = process.env.MEDIA_S3_SECRET_ACCESS_KEY;
const PUBLIC_BASE = (process.env.MEDIA_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

// Legacy Azure Blob host. Old rows may still carry these URLs, so they
// count as "already ours" and are never re-hosted.
const LEGACY_HOST_MARKER = ".blob.core.windows.net/";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: ENDPOINT,
      region: REGION,
      forcePathStyle: true, // MinIO/Silo: path-style only
      credentials: { accessKeyId: ACCESS_KEY!, secretAccessKey: SECRET_KEY! },
    });
  }
  return client;
}

export function blobConfigured(): boolean {
  return !!(ENDPOINT && BUCKET && ACCESS_KEY && SECRET_KEY && PUBLIC_BASE);
}

/** True when `url` already points at our own media store (new or legacy). */
export function isOwnMediaUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  if (url.includes(LEGACY_HOST_MARKER)) return true;
  return !!PUBLIC_BASE && url.startsWith(PUBLIC_BASE + "/");
}

function publicUrl(key: string): string {
  return `${PUBLIC_BASE}/${key}`;
}

function randomName(ext: string): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
}

// Short-lived presigned PUT so the browser uploads a video DIRECTLY to the
// object store, bypassing the Next server's body/memory limits. Returns
// the upload URL + the final public URL, or null if storage isn't configured.
// (Name kept from the Azure SAS era so callers don't change.)
export async function videoUploadSas(
  ext: string,
  contentType: string,
): Promise<{ uploadUrl: string; blobUrl: string } | null> {
  if (!blobConfigured()) return null;
  const key = `videos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType, CacheControl: "public, max-age=31536000" }),
    { expiresIn: 15 * 60 },
  );
  return { uploadUrl, blobUrl: publicUrl(key) };
}

/** Upload a raw buffer to the media store, return its public URL. */
export async function uploadBuffer(buffer: Buffer, ext: string, contentType: string): Promise<string> {
  if (!blobConfigured()) throw new Error("Media storage (MEDIA_S3_*) not configured");
  const key = randomName(ext);
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
    }),
  );
  return publicUrl(key);
}

/**
 * Download an external image and re-host it on our media store.
 * Returns the new URL, or null if the source can't be fetched (403/hotlink-blocked/timeout).
 * Use this on every ingested news image so RE never hotlinks publisher images.
 */
// Like uploadImageFromUrl but also returns the source image's original
// dimensions, so callers can skip tiny thumbnails (which look blurry when
// shown large). width/height are 0 when unknown (already-hosted, or a
// raw-format fallback sharp couldn't read) - callers treat 0 as "don't flag".
export async function uploadImageFromUrlWithMeta(
  srcUrl: string | null | undefined,
): Promise<{ url: string; width: number; height: number } | null> {
  if (!srcUrl || !blobConfigured()) return null;
  // Already ours - don't re-host
  if (isOwnMediaUrl(srcUrl)) return { url: srcUrl, width: 0, height: 0 };

  try {
    const res = await fetch(srcUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "image/*",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;

    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.includes(ct)) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) return null;

    // Strip third-party EXIF + stamp Rayalaseema News. Defaults: resize
    // to 1600px wide, JPEG q85 (PNG if source had alpha).
    try {
      const processed = await processImageBuffer(buffer);
      const url = await uploadBuffer(processed.buffer, processed.ext, processed.contentType);
      return { url, width: processed.origWidth, height: processed.origHeight };
    } catch (e) {
      // If sharp chokes on the format (rare - animated GIF, exotic AVIF),
      // fall back to uploading the original bytes. Better a clean republish
      // than a 404 on the public site.
      console.warn("[uploadImageFromUrl] processImageBuffer failed, uploading raw:", e);
      const url = await uploadBuffer(buffer, EXT_BY_TYPE[ct] || "jpg", ct);
      return { url, width: 0, height: 0 };
    }
  } catch {
    return null;
  }
}

export async function uploadImageFromUrl(srcUrl: string | null | undefined): Promise<string | null> {
  return (await uploadImageFromUrlWithMeta(srcUrl))?.url ?? null;
}

/**
 * Idempotent guard: if `url` is already on our media store, return it
 * unchanged. If it's an external http(s) URL, download + re-host through
 * processImageBuffer (EXIF strip + WebP + brand stamp) and return the new
 * URL. data:/relative/null inputs pass through.
 *
 * Used at every Content create/update endpoint so external thumbnails
 * (10tv.in, asianetnews.com, telugutimes.net, etc) never leak onto the
 * public homepage - they were the biggest network-payload regression
 * in the PSI re-audit after the next/image migration.
 */
export async function ensureBlobHosted(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (typeof url !== "string") return null;
  if (isOwnMediaUrl(url)) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    const rehosted = await uploadImageFromUrl(url);
    return rehosted || url;
  } catch (e) {
    console.warn("[ensureBlobHosted] rehost failed, keeping original:", e);
    return url;
  }
}
