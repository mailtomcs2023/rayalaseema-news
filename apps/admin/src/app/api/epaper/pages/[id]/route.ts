import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { createSnapshot } from "@/lib/epaper/snapshots";

// DELETE /api/epaper/pages/[id]
// Removes the page and closes the gap in pageNumber sequence.
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const page = await prisma.epaperPage.findUnique({ where: { id } });
    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    await createSnapshot(page.editionId, "manual", { note: `Auto: before delete page ${page.pageNumber}`, snappedById: session.user.id });

    const downstream = await prisma.epaperPage.findMany({
      where: { editionId: page.editionId, pageNumber: { gt: page.pageNumber } },
      orderBy: { pageNumber: "asc" },
      select: { id: true, pageNumber: true },
    });

    await prisma.epaperPage.delete({ where: { id } });

    // Close the gap (two-pass to dodge unique constraint).
    for (const p of downstream) {
      await prisma.epaperPage.update({ where: { id: p.id }, data: { pageNumber: -p.pageNumber } });
    }
    for (const p of downstream) {
      await prisma.epaperPage.update({ where: { id: p.id }, data: { pageNumber: p.pageNumber - 1 } });
    }

    await prisma.epaperEdition.update({
      where: { id: page.editionId },
      data: { pageCount: { decrement: 1 }, status: "draft" },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

// POST /api/epaper/pages/[id]/duplicate
// Inserts a copy of the page directly AFTER itself.
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const src = await prisma.epaperPage.findUnique({ where: { id } });
    if (!src) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    await createSnapshot(src.editionId, "manual", { note: `Auto: before duplicate page ${src.pageNumber}`, snappedById: session.user.id });

    const insertAt = src.pageNumber + 1;
    const downstream = await prisma.epaperPage.findMany({
      where: { editionId: src.editionId, pageNumber: { gte: insertAt } },
      orderBy: { pageNumber: "asc" },
      select: { id: true, pageNumber: true },
    });
    for (const p of downstream) {
      await prisma.epaperPage.update({ where: { id: p.id }, data: { pageNumber: -p.pageNumber } });
    }
    for (const p of downstream) {
      await prisma.epaperPage.update({ where: { id: p.id }, data: { pageNumber: p.pageNumber + 1 } });
    }

    const copy = await prisma.epaperPage.create({
      data: {
        editionId: src.editionId,
        pageNumber: insertAt,
        label: `${src.label} (copy)`,
        templateSlug: src.templateSlug,
        layout: src.layout as any,
        imageUrl: "",
      },
    });
    await prisma.epaperEdition.update({
      where: { id: src.editionId },
      data: { pageCount: { increment: 1 }, status: "draft" },
    });
    return NextResponse.json(copy, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
