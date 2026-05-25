import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { createSnapshot } from "@/lib/epaper/snapshots";

// GET /api/epaper/snapshots?editionId=...
// Lists snapshots for the editor's History panel, newest first.
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const editionId = req.nextUrl.searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId required" }, { status: 400 });
    const rows = await prisma.epaperEditionSnapshot.findMany({
      where: { editionId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reason: true,
        note: true,
        createdAt: true,
        snappedBy: { select: { id: true, name: true } },
      },
      take: 100,
    });
    return NextResponse.json({ snapshots: rows });
  } catch (e) {
    return apiError(e);
  }
}

// POST /api/epaper/snapshots
// Body: { editionId, note? }
// Manual snapshot from the History panel's "Snapshot now" button.
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const editionId = body?.editionId as string;
    if (!editionId) return NextResponse.json({ error: "editionId required" }, { status: 400 });
    const snap = await createSnapshot(editionId, "manual", {
      note: body.note,
      snappedById: session.user.id,
    });
    return NextResponse.json(snap, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
