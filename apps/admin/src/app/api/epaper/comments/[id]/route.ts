import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// PATCH /api/epaper/comments/[id] — toggle resolved or edit text
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: any = {};
    if (typeof body.resolved === "boolean") data.resolved = body.resolved;
    if (typeof body.text === "string" && body.text.trim()) data.text = body.text.trim();
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    const c = await prisma.epaperComment.update({ where: { id }, data });
    return NextResponse.json(c);
  } catch (e) { return apiError(e); }
}

// DELETE /api/epaper/comments/[id]
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.epaperComment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
