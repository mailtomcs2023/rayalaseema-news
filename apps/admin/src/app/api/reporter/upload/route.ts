import { NextRequest, NextResponse } from "next/server";
import { getReporterId } from "@/lib/reporter-auth";
import { uploadBuffer, blobConfigured } from "@/lib/blob";
import { sniffImageMime } from "@/lib/image-magic";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

// Image upload for the reporter app (article photos). Token-protected;
// uploads the file to Azure Blob and returns its public URL.
//
// Defense in depth — we check BOTH:
//   1. The client-declared `file.type` is in our allow-list (cheap).
//   2. The actual file bytes start with the magic signature for that MIME
//      (the multipart Content-Type header is attacker-controlled, so a
//      `malware.html` renamed to `photo.jpg` can otherwise sneak in and
//      get served back as an XSS payload from Azure Blob).
export async function POST(req: NextRequest) {
  if (!(await getReporterId(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

    const buffer = Buffer.from(await file.arrayBuffer());

    // Magic-byte verification — the bytes have to actually be the image type
    // the client claimed. Stops content-type spoofing in its tracks.
    const detected = sniffImageMime(buffer);
    if (!detected || detected !== file.type) {
      return NextResponse.json(
        { error: "File contents do not match an allowed image format" },
        { status: 400 },
      );
    }

    const url = await uploadBuffer(buffer, EXT_BY_TYPE[detected], detected);

    return NextResponse.json({ url, size: file.size });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
