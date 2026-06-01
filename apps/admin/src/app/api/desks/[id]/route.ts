import { NextRequest, NextResponse } from "next/server";
import { prisma, deskUpdateSchema } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const desk = await prisma.desk.findUnique({
      where: { id },
      include: { _count: { select: { contents: true } } },
    });
    if (!desk) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(desk);
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const rawBody = await req.json();
    const parsed = deskUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const body = parsed.data as Record<string, any>;
    const data: any = {};
    for (const k of ["name", "nameEn", "slug", "branch", "parentId", "categoryId", "districtId", "constituencyId", "sortOrder", "active"] as const) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    // Normalize empty FK strings to null so Prisma doesn't try to look them up.
    for (const fk of ["parentId", "categoryId", "districtId", "constituencyId"]) {
      if (data[fk] === "") data[fk] = null;
    }
    const desk = await prisma.desk.update({ where: { id }, data });
    return NextResponse.json(desk);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    // Detach content rows pointing at this desk so the FK doesn't block deletion.
    // (Rows fall back to their auto-resolved desk on next save.)
    await prisma.content.updateMany({ where: { deskId: id }, data: { deskId: null } });
    await prisma.desk.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError(e);
  }
}
