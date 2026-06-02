import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// PATCH /api/precious-metals/[id]
// Accepts any subset of { active, pricePerGram, source } so the admin row
// actions (eye toggle, inline price edit) reuse one route.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: { active?: boolean; pricePerGram?: number; source?: string | null } = {};

    if (typeof body.active === "boolean") data.active = body.active;
    if (body.pricePerGram !== undefined) {
      const p = Number(body.pricePerGram);
      if (!Number.isFinite(p) || p <= 0) {
        return NextResponse.json({ error: "Price must be a positive number" }, { status: 400 });
      }
      data.pricePerGram = p;
    }
    if (body.source !== undefined) {
      data.source = body.source ? String(body.source).trim() : null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }
    const updated = await prisma.preciousMetalRate.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    return apiError(error);
  }
}

// DELETE /api/precious-metals/[id] - ADMIN only (same gate as /api/mandi/[id]).
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.preciousMetalRate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
