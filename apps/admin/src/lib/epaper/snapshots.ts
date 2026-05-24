// Snapshot helpers for the e-paper editor.
//
// A snapshot captures every EpaperPage's `layout`/`templateSlug`/`label`/
// `version` for an edition at a moment in time. Restoring writes a fresh
// "pre-restore" snapshot of the current state first, then overwrites every
// page from the chosen snapshot — so rollback is itself undoable.
//
// We deliberately do NOT snapshot ads, rendered PDFs, or the edition status —
// those are regenerated artifacts that can be rebuilt from layout + assets.

import { prisma } from "@rayalaseema/db";

export interface SnapshotPagePayload {
  pageNumber: number;
  label: string;
  templateSlug: string | null;
  layout: unknown;
  version: number;
}

export type SnapshotReason = "manual" | "pre-render" | "pre-regenerate" | "pre-restore";

export async function createSnapshot(
  editionId: string,
  reason: SnapshotReason,
  options: { note?: string; snappedById?: string } = {},
) {
  const pages = await prisma.epaperPage.findMany({
    where: { editionId },
    orderBy: { pageNumber: "asc" },
    select: { pageNumber: true, label: true, templateSlug: true, layout: true, version: true },
  });

  const payload: SnapshotPagePayload[] = pages.map((p) => ({
    pageNumber: p.pageNumber,
    label: p.label,
    templateSlug: p.templateSlug,
    layout: p.layout,
    version: p.version,
  }));

  return prisma.epaperEditionSnapshot.create({
    data: {
      editionId,
      reason,
      note: options.note ?? null,
      snappedById: options.snappedById ?? null,
      pages: payload as any,
    },
  });
}

/**
 * Restore an edition to a snapshot. Writes a fresh "pre-restore" snapshot of
 * the current state first so the operator can undo the restore itself.
 *
 * Page handling:
 *   - For every page in the snapshot, if a current page with the same
 *     pageNumber exists → overwrite its layout/label/templateSlug
 *     (and bump version so any in-flight editor PATCH 409s).
 *   - If a snapshot page references a pageNumber no longer in the edition,
 *     create a new EpaperPage row at that pageNumber.
 *   - Current pages whose pageNumber doesn't appear in the snapshot are
 *     deleted — restoring means "make it look like the snapshot".
 */
export async function restoreSnapshot(snapshotId: string, restoredById?: string) {
  const snap = await prisma.epaperEditionSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snap) throw new Error(`Snapshot ${snapshotId} not found`);

  const snapshotPages = (snap.pages as unknown as SnapshotPagePayload[]) ?? [];
  const editionId = snap.editionId;

  // 1. Safety snapshot of current state before we overwrite anything.
  await createSnapshot(editionId, "pre-restore", {
    note: `Auto-saved before restoring snapshot ${snap.id}`,
    snappedById: restoredById,
  });

  // 2. Apply the snapshot.
  const existing = await prisma.epaperPage.findMany({
    where: { editionId },
    select: { id: true, pageNumber: true },
  });
  const existingByPageNumber = new Map(existing.map((p) => [p.pageNumber, p.id]));
  const snapshotPageNumbers = new Set(snapshotPages.map((p) => p.pageNumber));

  for (const sp of snapshotPages) {
    const existingId = existingByPageNumber.get(sp.pageNumber);
    if (existingId) {
      await prisma.epaperPage.update({
        where: { id: existingId },
        data: {
          label: sp.label,
          templateSlug: sp.templateSlug,
          layout: sp.layout as any,
          version: { increment: 1 },
        },
      });
    } else {
      await prisma.epaperPage.create({
        data: {
          editionId,
          pageNumber: sp.pageNumber,
          label: sp.label,
          templateSlug: sp.templateSlug,
          layout: sp.layout as any,
          imageUrl: "",
        },
      });
    }
  }

  // 3. Drop pages that no longer appear in the snapshot.
  const idsToDelete = existing
    .filter((p) => !snapshotPageNumbers.has(p.pageNumber))
    .map((p) => p.id);
  if (idsToDelete.length > 0) {
    await prisma.epaperPage.deleteMany({ where: { id: { in: idsToDelete } } });
  }

  await prisma.epaperEdition.update({
    where: { id: editionId },
    data: { status: "draft", pageCount: snapshotPages.length },
  });
}
