import { NextRequest, NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";

const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER = "uploads";

// POST /api/epaper/clip — receives a cropped PNG, stores it, returns shareable URL.
// Public: any reader can clip an e-paper region.
export async function POST(req: NextRequest) {
  if (!CONN) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }
  try {
    const form = await req.formData();
    const file = form.get("clip") as File;
    if (!file) return NextResponse.json({ error: "No clip provided" }, { status: 400 });
    if (file.size > 6 * 1024 * 1024) {
      return NextResponse.json({ error: "Clip too large" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = `clip-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.png`;
    const container = BlobServiceClient.fromConnectionString(CONN).getContainerClient(CONTAINER);
    const blob = container.getBlockBlobClient(name);
    await blob.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: "image/png", blobCacheControl: "public, max-age=31536000" },
    });

    return NextResponse.json({ url: blob.url });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
