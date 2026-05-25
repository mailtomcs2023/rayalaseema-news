import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

const ALLOWED_TYPES = ["FRONT", "DISTRICT", "SECTION", "BACK"] as const;

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const t = await prisma.epaperTemplate.findUnique({ where: { id } });
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(t);
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: any = {};
    for (const k of ["slug", "name", "type", "defaultLabel", "fillRules", "layout", "sortOrder", "active"]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (data.type && !ALLOWED_TYPES.includes(data.type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    const t = await prisma.epaperTemplate.update({ where: { id }, data });
    return NextResponse.json(t);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.epaperTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError(e);
  }
}
