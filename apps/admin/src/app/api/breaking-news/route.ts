import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const items = await prisma.breakingNews.findMany({ orderBy: { priority: "asc" } });
    return NextResponse.json(items);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const count = await prisma.breakingNews.count();
    const item = await prisma.breakingNews.create({
      data: { headline: body.headline, headlineEn: body.headlineEn, url: body.url, priority: body.priority || count + 1, active: body.active ?? true },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
