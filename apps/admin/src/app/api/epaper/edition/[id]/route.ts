import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// DELETE /api/epaper/edition/[id]
// Deletes an e-paper edition. Pages / ads / comments / snapshots cascade
// (onDelete: Cascade in the schema). Restricted to ADMIN + EDITOR.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.epaperEdition.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
