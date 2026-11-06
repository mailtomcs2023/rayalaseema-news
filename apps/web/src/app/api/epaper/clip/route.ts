import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Media store (MinIO/Silo, S3 API). Same env as the admin app's lib/blob.ts.
const ENDPOINT = process.env.MEDIA_S3_ENDPOINT;
const BUCKET = process.env.MEDIA_S3_BUCKET;
const ACCESS_KEY = process.env.MEDIA_S3_ACCESS_KEY_ID;
const SECRET_KEY = process.env.MEDIA_S3_SECRET_ACCESS_KEY;
const PUBLIC_BASE = (process.env.MEDIA_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: ENDPOINT,
      region: process.env.MEDIA_S3_REGION || "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: ACCESS_KEY!, secretAccessKey: SECRET_KEY! },
    });
  }
  return client;
}

// POST /api/epaper/clip - receives a cropped PNG, stores it, returns shareable URL.
// Public: any reader can clip an e-paper region.
export async function POST(req: NextRequest) {
  if (!ENDPOINT || !BUCKET || !ACCESS_KEY || !SECRET_KEY || !PUBLIC_BASE) {
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
    // Respect the uploaded format - the viewer sends JPEG (much smaller/faster
    // than PNG for newspaper crops); older clients may still send PNG.
    const type = file.type === "image/jpeg" ? "image/jpeg" : file.type === "image/webp" ? "image/webp" : "image/png";
    const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
    const name = `clip-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
    await s3().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: name,
        Body: buffer,
        ContentType: type,
        CacheControl: "public, max-age=31536000",
      }),
    );

    return NextResponse.json({ url: `${PUBLIC_BASE}/${name}` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
