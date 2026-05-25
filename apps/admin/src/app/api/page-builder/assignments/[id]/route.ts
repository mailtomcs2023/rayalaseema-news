// Page Builder (Spec #2) — single-assignment endpoint.
//   PUT    → edit pattern / priority / active / templateId (ADMIN + EDITOR)
//   DELETE → remove                                        (ADMIN + EDITOR)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: {
      pattern?: string;
      priority?: number;
      active?: boolean;
      templateId?: string;
    } = {};
    if (typeof body.pattern === "string") data.pattern = body.pattern.trim();
    if (Number.isFinite(Number(body.priority))) data.priority = Number(body.priority);
    if (typeof body.active === "boolean") data.active = body.active;
    if (typeof body.templateId === "string") data.templateId = body.templateId;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    const a = await prisma.templateAssignment.update({ where: { id }, data });
    return NextResponse.json(a);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.templateAssignment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
