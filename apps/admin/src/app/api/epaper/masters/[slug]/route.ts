import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/epaper/masters/[slug] — full master incl. layout.
// PATCH /api/epaper/masters/[slug] — { layout?, name?, geometryOverride?, expectedVersion? }
// DELETE /api/epaper/masters/[slug] — refuse if any EpaperTemplate.masterSlug references it.

export async function GET(_: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { slug } = await params;
    const master = await prisma.epaperMaster.findUnique({ where: { slug } });
    if (!master) return NextResponse.json({ error: "Master not found" }, { status: 404 });
    return NextResponse.json({ master });
  } catch (e) { return apiError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { slug } = await params;
    const body = await req.json();
    const current = await prisma.epaperMaster.findUnique({ where: { slug } });
    if (!current) return NextResponse.json({ error: "Master not found" }, { status: 404 });
    if (typeof body.expectedVersion === "number" && body.expectedVersion !== current.version) {
      return NextResponse.json({
        error: "Conflict — master was updated by someone else.",
        code: "STALE_VERSION", currentVersion: current.version,
      }, { status: 409 });
    }
    const updated = await prisma.epaperMaster.update({
      where: { slug },
      data: {
        ...(typeof body.name === "string" ? { name: body.name } : {}),
        ...(body.layout !== undefined ? { layout: body.layout } : {}),
        ...(body.geometryOverride !== undefined ? { geometryOverride: body.geometryOverride } : {}),
        version: { increment: 1 },
      },
    });
    return NextResponse.json({ master: updated });
  } catch (e) { return apiError(e); }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { slug } = await params;
    const refs = await prisma.epaperTemplate.count({ where: { masterSlug: slug } });
    if (refs > 0) {
      return NextResponse.json({
        error: `Master in use by ${refs} template${refs > 1 ? "s" : ""} — detach those templates before deleting.`,
        code: "MASTER_IN_USE", references: refs,
      }, { status: 409 });
    }
    await prisma.epaperMaster.delete({ where: { slug } });
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
