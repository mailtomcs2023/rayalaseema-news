// POST /api/images/process { url } - download an external image, strip its
// EXIF (GPS / camera body / original photographer), stamp Rayalaseema
// Express as copyright + artist, re-host on Azure Blob, return the new URL.
//
// Used by:
//   - <ImageSearchModal/> after the user picks a Pexels/Google result
//   - the unified content editor's URL-paste fallback (any external image
//     should pass through here before being saved)
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { downloadAndProcess } from "@/lib/image-process";
import { uploadBuffer, blobConfigured } from "@/lib/blob";
import { isUrlSafeToFetch } from "@/lib/ssrf-guard";

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  if (!blobConfigured()) {
    return NextResponse.json({ error: "AZURE_STORAGE_CONNECTION_STRING not configured" }, { status: 503 });
  }
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }
    // SSRF guard - same one /api/ai/rewrite uses for the scrape path. Blocks
    // 127.0.0.1, 169.254.169.254 (cloud metadata), private ranges, DNS rebind.
    const safety = await isUrlSafeToFetch(url);
    if (!safety.safe) {
      return NextResponse.json({ error: `Refusing to fetch: ${safety.reason}` }, { status: 400 });
    }

    const { buffer, contentType, ext } = await downloadAndProcess(url);
    const hosted = await uploadBuffer(buffer, ext, contentType);
    return NextResponse.json({ url: hosted, bytes: buffer.length });
  } catch (e: any) {
    console.error("[images/process]", e);
    return NextResponse.json({ error: e?.message || "Process failed" }, { status: 502 });
  }
}
