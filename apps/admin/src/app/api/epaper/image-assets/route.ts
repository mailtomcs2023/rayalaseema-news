import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

const CATEGORIES = ["CARTOON", "CLASSIFIED", "MASTHEAD", "PHOTO", "GRAPHIC", "OTHER"] as const;

// GET /api/epaper/image-assets?category=CARTOON&q=...&active=1
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const sp = req.nextUrl.searchParams;
    const category = sp.get("category");
    const q = (sp.get("q") || "").trim();
    const activeOnly = sp.get("active") === "1";
    const where: any = {};
    if (category && CATEGORIES.includes(category as any)) where.category = category;
    if (activeOnly) where.active = true;
    if (q) where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { tags: { contains: q, mode: "insensitive" } },
    ];
    const rows = await prisma.epaperImageAsset.findMany({
      where, orderBy: { createdAt: "desc" }, take: 200,
    });
    return NextResponse.json(rows);
  } catch (e) { return apiError(e); }
}

// POST /api/epaper/image-assets — create
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const { category, title, imageUrl, caption, tags, active } = body;
    if (!title || !imageUrl) return NextResponse.json({ error: "title + imageUrl required" }, { status: 400 });
    if (category && !CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    const row = await prisma.epaperImageAsset.create({
      data: {
        category: category || "OTHER",
        title, imageUrl,
        caption: caption || null,
        tags: tags || null,
        active: active !== false,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) { return apiError(e); }
}
