import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { uploadBuffer, blobConfigured } from "@/lib/blob";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
};

async function findEdition(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const dateParam = sp.get("date");
  if (!dateParam) return null;
  const editionKey = sp.get("edition") || "main";
  const date = new Date(dateParam);
  date.setHours(0, 0, 0, 0);
  return prisma.epaperEdition.findUnique({ where: { date_edition: { date, edition: editionKey } } });
}

// GET /api/epaper/ads?date=&edition= — list ads for the edition
export async function GET(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const edition = await findEdition(req);
    if (!edition) return NextResponse.json([]);
    const ads = await prisma.epaperAd.findMany({ where: { editionId: edition.id }, orderBy: { pageNumber: "asc" } });
    return NextResponse.json(ads);
  } catch (error) {
    return apiError(error);
  }
}

// POST /api/epaper/ads?date=&edition= — upload an ad (formData: file, pageNumber, slot, linkUrl)
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  if (!blobConfigured()) return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  try {
    const edition = await findEdition(req);
    if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file") as File;
    const pageNumber = parseInt(String(form.get("pageNumber") || "1"));
    const slot = String(form.get("slot") || "top");
    const linkUrl = String(form.get("linkUrl") || "") || null;
    if (!file || !EXT[file.type]) return NextResponse.json({ error: "Image file required" }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "Ad too large (max 4MB)" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageUrl = await uploadBuffer(buffer, EXT[file.type], file.type);

    const ad = await prisma.epaperAd.create({
      data: { editionId: edition.id, pageNumber, slot, imageUrl, linkUrl },
    });
    return NextResponse.json(ad, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

// DELETE /api/epaper/ads?id= — remove an ad
export async function DELETE(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.epaperAd.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
