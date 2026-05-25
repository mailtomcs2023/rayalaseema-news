import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { createSnapshot } from "@/lib/epaper/snapshots";

// POST /api/epaper/pages
// Body: { editionId, templateSlug, insertAfter?: pageNumber, label? }
// Inserts a new page seeded from a template at the given position. Pages at or
// after the insertion point get their pageNumber bumped by 1 (temp-negative
// scratch trick keeps the [editionId,pageNumber] unique constraint happy).
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const { editionId, templateSlug, insertAfter, label, blank } = body as {
      editionId: string; templateSlug?: string; insertAfter?: number | null; label?: string; blank?: boolean;
    };
    if (!editionId) {
      return NextResponse.json({ error: "editionId required" }, { status: 400 });
    }
    // Blank-page mode: empty canvas the operator draws onto. No template
    // applied; layout = { blocks: [] }. Picks templateSlug='blank' for the
    // page record so the renderer treats it as a freeform layout.
    let template: { slug: string; layout: unknown; defaultLabel?: string | null; name: string } | null = null;
    if (blank) {
      template = { slug: "blank", layout: { blocks: [] }, defaultLabel: "Blank page", name: "Blank page" };
    } else {
      if (!templateSlug) return NextResponse.json({ error: "templateSlug or blank:true required" }, { status: 400 });
      template = await prisma.epaperTemplate.findUnique({ where: { slug: templateSlug } });
      if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    await createSnapshot(editionId, "manual", { note: "Auto: before page insert", snappedById: session.user.id });

    const existing = await prisma.epaperPage.findMany({
      where: { editionId },
      orderBy: { pageNumber: "asc" },
      select: { id: true, pageNumber: true },
    });
    const insertAt = typeof insertAfter === "number" ? insertAfter + 1 : existing.length + 1;

    // Shift downstream pages up by 1 — write to temp negative slot first to
    // dodge the unique constraint.
    const downstream = existing.filter((p) => p.pageNumber >= insertAt);
    for (const p of downstream) {
      await prisma.epaperPage.update({ where: { id: p.id }, data: { pageNumber: -p.pageNumber } });
    }
    for (const p of downstream) {
      await prisma.epaperPage.update({ where: { id: p.id }, data: { pageNumber: p.pageNumber + 1 } });
    }

    const page = await prisma.epaperPage.create({
      data: {
        editionId,
        pageNumber: insertAt,
        label: label || template.defaultLabel || template.name,
        templateSlug: template.slug,
        layout: template.layout as any,
        imageUrl: "",
      },
    });
    await prisma.epaperEdition.update({
      where: { id: editionId },
      data: { pageCount: { increment: 1 }, status: "draft" },
    });
    return NextResponse.json(page, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}

// PATCH /api/epaper/pages
// Body: { editionId, order: pageId[] }
// Bulk-reorder: array order becomes the new pageNumber sequence (1..N).
export async function PATCH(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const { editionId, order } = body as { editionId: string; order: string[] };
    if (!editionId || !Array.isArray(order) || order.length === 0) {
      return NextResponse.json({ error: "editionId + order required" }, { status: 400 });
    }

    await createSnapshot(editionId, "manual", { note: "Auto: before page reorder", snappedById: session.user.id });

    // Two-pass to dodge unique constraint.
    for (let i = 0; i < order.length; i++) {
      await prisma.epaperPage.update({ where: { id: order[i] }, data: { pageNumber: -(i + 1) } });
    }
    for (let i = 0; i < order.length; i++) {
      await prisma.epaperPage.update({ where: { id: order[i] }, data: { pageNumber: i + 1 } });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
