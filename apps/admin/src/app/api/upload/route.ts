import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { uploadBuffer, blobConfigured } from "@/lib/blob";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;

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
    const url = await uploadBuffer(buffer, EXT_BY_TYPE[file.type], file.type);

    return NextResponse.json({ url, size: file.size });
  } catch (error) {
    return apiError(error);
  }
}
