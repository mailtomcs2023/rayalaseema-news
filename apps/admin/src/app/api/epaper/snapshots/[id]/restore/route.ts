import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { restoreSnapshot } from "@/lib/epaper/snapshots";

// POST /api/epaper/snapshots/[id]/restore
// Rollback the edition this snapshot belongs to back to its state at snap time.
// A "pre-restore" snapshot of the current state is written first so the
// rollback itself is undoable.
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await restoreSnapshot(id, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message?.includes("not found")) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }
    return apiError(e);
  }
}
