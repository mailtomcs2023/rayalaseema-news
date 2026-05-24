import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: any = {};
    for (const k of ["category", "title", "imageUrl", "caption", "tags", "active"]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    const row = await prisma.epaperImageAsset.update({ where: { id }, data });
    return NextResponse.json(row);
  } catch (e) { return apiError(e); }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.epaperImageAsset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
