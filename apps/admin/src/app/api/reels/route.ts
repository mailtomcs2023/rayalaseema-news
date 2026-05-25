import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    return NextResponse.json(await prisma.reel.findMany({ orderBy: { createdAt: "desc" } }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const b = await req.json();
    const slug = b.slug || `reel-${Date.now()}`;
    return NextResponse.json(await prisma.reel.create({ data: { title: b.title, slug, thumbnailUrl: b.thumbnailUrl, videoUrl: b.videoUrl, views: b.views || "0" } }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
