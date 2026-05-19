import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

// DELETE /api/tags/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.tag.delete({ where: { id } });
    await logAudit({
      action: "tag.delete",
      resource: "tag",
      resourceId: id,
      meta: { name: existing.name, slug: existing.slug },
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
