import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/epaper/ad-assets?active=1
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const activeOnly = req.nextUrl.searchParams.get("active") === "1";
    const rows = await prisma.epaperAdAsset.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(rows);
  } catch (e) { return apiError(e); }
}

// POST /api/epaper/ad-assets — create
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const { advertiser, imageUrl, linkUrl, validFrom, validTo, price, notes, active } = body;
    if (!advertiser || !imageUrl) return NextResponse.json({ error: "advertiser + imageUrl required" }, { status: 400 });
    const row = await prisma.epaperAdAsset.create({
      data: {
        advertiser, imageUrl,
        linkUrl: linkUrl || null,
        validFrom: validFrom ? new Date(validFrom) : null,
        validTo: validTo ? new Date(validTo) : null,
        price: typeof price === "number" ? price : null,
        notes: notes || null,
        active: active !== false,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) { return apiError(e); }
}
