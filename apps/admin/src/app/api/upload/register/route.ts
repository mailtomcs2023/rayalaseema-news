import { NextRequest, NextResponse } from "next/server";
import { uploadBuffer, blobConfigured } from "@/lib/blob";

// Public upload endpoint used ONLY by the reporter app's self-registration
// flow — at that point the reporter doesn't have an account or a token yet,
// so the admin-auth-gated `/api/upload` and the token-gated
// `/api/reporter/upload` both reject the request.
//
// Without this endpoint, self-register uploads silently 401'd and returned
// empty URLs, so `kycStatus` for self-registered reporters was always
// landing on "PENDING" — they showed the "Upload documents" card even
// though they'd just uploaded their docs in the wizard.
//
// Security: capped at one image, ≤5MB, restricted MIME types. Filenames
// are server-generated (no path traversal), and the response is just a
// blob URL. Rate limiting at the gateway is still a good idea before this
// hits production.
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export async function POST(req: NextRequest) {
  if (!blobConfigured()) {
    return NextResponse.json(
      { error: "AZURE_STORAGE_CONNECTION_STRING not configured" },
      { status: 503 },
    );
  }
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!EXT_BY_TYPE[file.type]) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, WebP, GIF, AVIF allowed" },
        { status: 400 },
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadBuffer(buffer, EXT_BY_TYPE[file.type], file.type);
    return NextResponse.json({ url, size: file.size });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
