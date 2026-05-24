import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: any = {};
    for (const k of ["advertiser", "imageUrl", "linkUrl", "price", "notes", "active"]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (body.validFrom !== undefined) data.validFrom = body.validFrom ? new Date(body.validFrom) : null;
    if (body.validTo !== undefined) data.validTo = body.validTo ? new Date(body.validTo) : null;
    const row = await prisma.epaperAdAsset.update({ where: { id }, data });
    return NextResponse.json(row);
  } catch (e) { return apiError(e); }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.epaperAdAsset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
