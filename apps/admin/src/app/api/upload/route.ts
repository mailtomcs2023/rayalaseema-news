import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // Validate file type
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Only JPEG, PNG, WebP, GIF, AVIF allowed" }, { status: 400 });
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    // Generate unique filename
    const ext = file.name.split(".").pop() || "jpg";
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}-${random}.${ext}`;

    // Save to BOTH admin and web public/uploads so both servers can serve it
    const adminUploadDir = path.join(process.cwd(), "public", "uploads");
    const webUploadDir = path.join(process.cwd(), "..", "web", "public", "uploads");

    await mkdir(adminUploadDir, { recursive: true });
    await mkdir(webUploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(adminUploadDir, filename), buffer);
    await writeFile(path.join(webUploadDir, filename), buffer);

    // Return the URL (works on both servers)
    const url = `/uploads/${filename}`;

    return NextResponse.json({ url, filename, size: file.size });
  } catch (error) {
    return apiError(error);
  }
}
