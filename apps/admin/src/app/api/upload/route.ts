import { NextRequest, NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER = "uploads";

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;

  if (!CONN) {
    return NextResponse.json({ error: "AZURE_STORAGE_CONNECTION_STRING not configured" }, { status: 503 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Only JPEG, PNG, WebP, GIF, AVIF allowed" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    // Unique blob name
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

    // Upload to Azure Blob Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const blobService = BlobServiceClient.fromConnectionString(CONN);
    const container = blobService.getContainerClient(CONTAINER);
    const blob = container.getBlockBlobClient(filename);
    await blob.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: file.type, blobCacheControl: "public, max-age=31536000" },
    });

    return NextResponse.json({ url: blob.url, filename, size: file.size });
  } catch (error) {
    return apiError(error);
  }
}
