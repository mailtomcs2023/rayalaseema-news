// Safety net for image fields that arrive as a base64 `data:` URL instead of
// a hosted URL. A data URL can be tens of thousands of characters, which the
// content schemas reject (featuredImage is capped at 2048 chars because it is
// meant to hold a short hosted URL). Rather than fail the save with a cryptic
// "Too big" error, we decode the data URL, run it through the standard
// EXIF-strip + re-stamp pipeline, rehost it on Azure Blob, and swap in the
// resulting URL before validation.
//
// No-op for normal http(s) URLs, for malformed data URLs, and when blob
// storage isn't configured (in which case the schema rejects the oversized
// value exactly as before). Mirrors the pipeline used by /api/images/enhance.
import { processImageBuffer } from "@/lib/image-process";
import { uploadBuffer, blobConfigured } from "@/lib/blob";

const DATA_URL_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/;
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Returns a shallow copy of `body` with any of `fields` that hold a base64
 * image data URL replaced by a hosted blob URL. Leaves every other value as
 * is. Best-effort: a field it can't rehost is left untouched for the schema
 * to handle.
 */
export async function rehostDataUrlFields<T extends Record<string, unknown>>(
  body: T,
  fields: readonly string[] = ["featuredImage"],
): Promise<T> {
  if (!body || typeof body !== "object") return body;
  let out: Record<string, unknown> = body;
  for (const field of fields) {
    const value = out[field];
    if (typeof value !== "string" || !value.startsWith("data:")) continue;
    const match = value.match(DATA_URL_RE);
    if (!match || !blobConfigured()) continue;
    const raw = Buffer.from(match[1].replace(/\s/g, ""), "base64");
    if (raw.length === 0 || raw.length > MAX_BYTES) continue;
    const processed = await processImageBuffer(raw);
    const hosted = await uploadBuffer(processed.buffer, processed.ext, processed.contentType);
    out = { ...out, [field]: hosted };
  }
  return out as T;
}
