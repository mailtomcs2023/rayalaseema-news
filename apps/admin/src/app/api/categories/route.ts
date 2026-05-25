import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { contents: true } } } });
    return NextResponse.json(categories);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const count = await prisma.category.count();
    const slug = body.slug || body.nameEn?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || `cat-${Date.now()}`;
    const cat = await prisma.category.create({
      data: { name: body.name, nameEn: body.nameEn, slug, color: body.color || "#FF2C2C", description: body.description, sortOrder: body.sortOrder || count + 1, active: body.active ?? true },
    });
    return NextResponse.json(cat, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
