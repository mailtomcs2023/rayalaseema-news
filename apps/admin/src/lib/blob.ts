import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} from "@azure/storage-blob";
import { processImageBuffer } from "./image-process";

const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER = "uploads";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function blobConfigured(): boolean {
  return !!CONN;
}

// Parse account name/key out of the connection string so we can mint a SAS.
function parseConnString(conn: string): { accountName: string; accountKey: string; suffix: string } | null {
  const map: Record<string, string> = {};
  for (const part of conn.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) map[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  if (!map.AccountName || !map.AccountKey) return null;
  return { accountName: map.AccountName, accountKey: map.AccountKey, suffix: map.EndpointSuffix || "core.windows.net" };
}

// Mint a short-lived, write-only SAS so the browser can upload a video file
// DIRECTLY to Azure Blob, bypassing the Next server's body/memory limits.
// Returns the upload URL (with SAS) + the final public blob URL, or null if
// blob storage isn't configured / the connection string lacks an account key.
export function videoUploadSas(
  ext: string,
  contentType: string,
): { uploadUrl: string; blobUrl: string } | null {
  if (!CONN) return null;
  const parsed = parseConnString(CONN);
  if (!parsed) return null;
  const { accountName, accountKey, suffix } = parsed;
  const cred = new StorageSharedKeyCredential(accountName, accountKey);
  const blobName = `videos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const now = Date.now();
  const sas = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER,
      blobName,
      permissions: BlobSASPermissions.parse("cw"), // create + write only
      startsOn: new Date(now - 60_000),
      expiresOn: new Date(now + 15 * 60_000),
      protocol: SASProtocol.Https,
      contentType,
    },
    cred,
  ).toString();
  const base = `https://${accountName}.blob.${suffix}/${CONTAINER}/${blobName}`;
  return { uploadUrl: `${base}?${sas}`, blobUrl: base };
}

/** Upload a raw buffer to Azure Blob, return its public URL. */
export async function uploadBuffer(buffer: Buffer, ext: string, contentType: string): Promise<string> {
  if (!CONN) throw new Error("AZURE_STORAGE_CONNECTION_STRING not configured");
  const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const container = BlobServiceClient.fromConnectionString(CONN).getContainerClient(CONTAINER);
  const blob = container.getBlockBlobClient(filename);
  await blob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType, blobCacheControl: "public, max-age=31536000" },
  });
  return blob.url;
}

/**
 * Download an external image and re-host it on Azure Blob.
 * Returns the blob URL, or null if the source can't be fetched (403/hotlink-blocked/timeout).
 * Use this on every ingested news image so RE never hotlinks publisher images.
 */
// Like uploadImageFromUrl but also returns the source image's original
// dimensions, so callers can skip tiny thumbnails (which look blurry when
// shown large). width/height are 0 when unknown (already-hosted blob, or a
// raw-format fallback sharp couldn't read) - callers treat 0 as "don't flag".
export async function uploadImageFromUrlWithMeta(
  srcUrl: string | null | undefined,
): Promise<{ url: string; width: number; height: number } | null> {
  if (!srcUrl || !CONN) return null;
  // Already an RE blob - don't re-host
  if (srcUrl.includes(".blob.core.windows.net/")) return { url: srcUrl, width: 0, height: 0 };

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
 * Idempotent guard: if `url` is already on our Azure Blob CDN, return
 * it unchanged. If it's an external http(s) URL, download + re-host
 * through processImageBuffer (EXIF strip + WebP + brand stamp) and
 * return the new blob URL. data:/relative/null inputs pass through.
 *
 * Used at every Content create/update endpoint so external thumbnails
 * (10tv.in, asianetnews.com, telugutimes.net, etc) never leak onto the
 * public homepage — they were the biggest network-payload regression
 * in the PSI re-audit after the next/image migration.
 */
export async function ensureBlobHosted(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (typeof url !== "string") return null;
  if (url.includes(".blob.core.windows.net/")) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    const rehosted = await uploadImageFromUrl(url);
    return rehosted || url;
  } catch (e) {
    console.warn("[ensureBlobHosted] rehost failed, keeping original:", e);
    return url;
  }
}
