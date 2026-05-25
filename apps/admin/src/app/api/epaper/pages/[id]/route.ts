import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { createSnapshot } from "@/lib/epaper/snapshots";

// DELETE /api/epaper/pages/[id]
// Removes the page and closes the gap in pageNumber sequence.
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
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
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
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

// PATCH /api/epaper/pages/[id]
// Body shapes:
//   { label: "..." }                  rename page
//   { moveTo: <pageNumber 1-based> }  reorder — shifts other pages to make room
//
// (Layout-editing PATCH lives on /api/epaper/page/[id] — that's the
// authoritative editor write path. This route handles the structural ops.)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const page = await prisma.epaperPage.findUnique({ where: { id } });
    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    if (typeof body.label === "string" && body.label.trim()) {
      const updated = await prisma.epaperPage.update({
        where: { id }, data: { label: body.label.trim() },
      });
      return NextResponse.json(updated);
    }

    if (typeof body.moveTo === "number") {
      const target = Math.max(1, Math.floor(body.moveTo));
      const total = await prisma.epaperPage.count({ where: { editionId: page.editionId } });
      const dest = Math.min(target, total);
      if (dest === page.pageNumber) return NextResponse.json(page);

      await createSnapshot(page.editionId, "manual", { note: `Auto: before move page ${page.pageNumber} → ${dest}`, snappedById: session.user.id });

      // Park source page in negative space; shift the affected range; restore source.
      await prisma.epaperPage.update({ where: { id }, data: { pageNumber: -1 } });
      if (dest < page.pageNumber) {
        // Moving earlier — bump pages in [dest..page.pageNumber-1] by +1.
        const affected = await prisma.epaperPage.findMany({
          where: { editionId: page.editionId, pageNumber: { gte: dest, lte: page.pageNumber - 1 } },
          orderBy: { pageNumber: "desc" },
          select: { id: true, pageNumber: true },
        });
        for (const p of affected) {
          await prisma.epaperPage.update({ where: { id: p.id }, data: { pageNumber: -(p.pageNumber + 1) } });
        }
        for (const p of affected) {
          await prisma.epaperPage.update({ where: { id: p.id }, data: { pageNumber: p.pageNumber + 1 } });
        }
      } else {
        // Moving later — bump pages in [page.pageNumber+1..dest] by -1.
        const affected = await prisma.epaperPage.findMany({
          where: { editionId: page.editionId, pageNumber: { gte: page.pageNumber + 1, lte: dest } },
          orderBy: { pageNumber: "asc" },
          select: { id: true, pageNumber: true },
        });
        for (const p of affected) {
          await prisma.epaperPage.update({ where: { id: p.id }, data: { pageNumber: -(p.pageNumber - 1) } });
        }
        for (const p of affected) {
          await prisma.epaperPage.update({ where: { id: p.id }, data: { pageNumber: p.pageNumber - 1 } });
        }
      }
      const moved = await prisma.epaperPage.update({ where: { id }, data: { pageNumber: dest } });
      await prisma.epaperEdition.update({ where: { id: page.editionId }, data: { status: "draft" } });
      return NextResponse.json(moved);
    }

    return NextResponse.json({ error: "Provide label or moveTo" }, { status: 400 });
  } catch (e) {
    return apiError(e);
  }
}
