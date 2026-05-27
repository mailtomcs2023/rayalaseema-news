// Page Builder (Spec #2) — single-composite endpoint.

import { NextRequest, NextResponse } from "next/server";
import { prisma, compositeBlocksSchema, Prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const c = await prisma.compositeBlock.findUnique({ where: { id } });
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(c);
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
    const data: Prisma.CompositeBlockUpdateInput = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (Object.prototype.hasOwnProperty.call(body, "description")) {
      data.description = body.description ? String(body.description) : null;
    }
    if (Array.isArray(body.blocks)) {
      const parsed = compositeBlocksSchema.safeParse(body.blocks);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid blocks payload", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      data.blocks = parsed.data as unknown as Prisma.InputJsonValue;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    const c = await prisma.compositeBlock.update({ where: { id }, data });
    return NextResponse.json(c);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.compositeBlock.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
