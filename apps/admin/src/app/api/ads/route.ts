import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    return NextResponse.json(await prisma.ad.findMany({ orderBy: { createdAt: "desc" } }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const b = await req.json();
    return NextResponse.json(await prisma.ad.create({ data: { name: b.name, position: b.position, imageUrl: b.imageUrl, linkUrl: b.linkUrl, htmlContent: b.htmlContent, bgColor: b.bgColor, textColor: b.textColor, active: b.active ?? true } }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
