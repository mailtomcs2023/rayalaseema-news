import { BlobServiceClient } from "@azure/storage-blob";
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
export async function uploadImageFromUrl(srcUrl: string | null | undefined): Promise<string | null> {
  if (!srcUrl || !CONN) return null;
  // Already an RE blob - don't re-host
  if (srcUrl.includes(".blob.core.windows.net/")) return srcUrl;

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
      return await uploadBuffer(processed.buffer, processed.ext, processed.contentType);
    } catch (e) {
      // If sharp chokes on the format (rare - animated GIF, exotic AVIF),
      // fall back to uploading the original bytes. Better a clean republish
      // than a 404 on the public site.
      console.warn("[uploadImageFromUrl] processImageBuffer failed, uploading raw:", e);
      return await uploadBuffer(buffer, EXT_BY_TYPE[ct] || "jpg", ct);
    }
  } catch {
    return null;
  }
}
