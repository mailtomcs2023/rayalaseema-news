// /api/content/[id]/pib-approve — Spec #1 (#107), PIB approval gate.
// Ported from /api/articles/[id]/pib-approve. Required Body: { pibReferenceNumber }.
// ADMIN-only.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const ref = ((body?.pibReferenceNumber as string) || "").trim();
    if (!ref) return NextResponse.json({ error: "pibReferenceNumber required" }, { status: 400 });

    const content = await prisma.content.findUnique({
      where: { id },
      select: { id: true, needsPibApproval: true, pibApprovedAt: true },
    });
    if (!content) return NextResponse.json({ error: "Content not found" }, { status: 404 });
    if (!content.needsPibApproval) {
      return NextResponse.json({ error: "Content not flagged for PIB approval" }, { status: 400 });
    }

    const updated = await prisma.content.update({
      where: { id },
      data: {
        pibApprovedAt: new Date(),
        pibReferenceNumber: ref,
      },
    });

    await logAudit({
      action: "content.pib_approve",
      resource: "content",
      resourceId: id,
      meta: { pibReferenceNumber: ref },
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json({ ok: true, content: updated });
  } catch (e) {
    return apiError(e);
  }
}
