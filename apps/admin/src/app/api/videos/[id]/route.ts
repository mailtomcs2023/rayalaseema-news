import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const b = await req.json();
    const data: any = {};
    for (const key of ["title", "slug", "description", "thumbnailUrl", "videoUrl", "duration", "featured", "active"] as const) {
      if (b[key] !== undefined) data[key] = b[key];
    }
    return NextResponse.json(await prisma.video.update({ where: { id }, data }));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.video.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
