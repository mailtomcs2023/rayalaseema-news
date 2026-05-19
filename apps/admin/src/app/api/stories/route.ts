import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    return NextResponse.json(await prisma.webStory.findMany({ orderBy: { createdAt: "desc" } }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const b = await req.json();
    const slug = b.slug || `story-${Date.now()}`;
    return NextResponse.json(await prisma.webStory.create({ data: { title: b.title, slug, imageUrl: b.imageUrl, category: b.category } }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
