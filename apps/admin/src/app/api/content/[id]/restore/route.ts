// POST /api/content/[id]/restore - undo a soft-delete. Clears deletedAt +
// deletedById. Only ADMIN / EDITOR may restore.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const existing = await prisma.content.findUnique({
      where: { id },
      select: { type: true, title: true, slug: true, status: true, deletedAt: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!existing.deletedAt) return NextResponse.json({ success: true, alreadyActive: true });

    await prisma.content.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });

    await logAudit({
      action: "content.restore",
      resource: "content",
      resourceId: id,
      meta: { type: existing.type, title: existing.title, slug: existing.slug },
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
