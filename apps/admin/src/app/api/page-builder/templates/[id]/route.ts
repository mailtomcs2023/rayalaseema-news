// Page Builder (Spec #2) - single-template endpoint.
//
//   GET    → fetch (any signed-in session)
//   PUT    → rename / re-describe (ADMIN + EDITOR)
//   DELETE → delete (+ cascade assignments + versions) - ADMIN only

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const t = await prisma.template.findUnique({
      where: { id },
      include: {
        _count: { select: { versions: true } },
        assignments: { orderBy: { priority: "desc" } },
      },
    });
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(t);
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: { name?: string; description?: string | null } = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (Object.prototype.hasOwnProperty.call(body, "description")) {
      data.description = body.description ? String(body.description) : null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    const t = await prisma.template.update({ where: { id }, data });
    return NextResponse.json(t);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.template.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
