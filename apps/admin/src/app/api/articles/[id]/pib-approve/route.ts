import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

// POST /api/articles/[id]/pib-approve  Body: { pibReferenceNumber }
//
// ADMIN-only: clears the PIB approval gate (#99) on an article flagged
// needsPibApproval. Stamps pibApprovedAt + pibApprovedById +
// pibReferenceNumber. Audit-logged.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const ref = (body?.pibReferenceNumber as string || "").trim();
    if (!ref) return NextResponse.json({ error: "pibReferenceNumber required" }, { status: 400 });

    const article = await prisma.article.findUnique({ where: { id }, select: { id: true, needsPibApproval: true, pibApprovedAt: true } });
    if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
    if (!article.needsPibApproval) {
      return NextResponse.json({ error: "Article not flagged for PIB approval" }, { status: 400 });
    }

    const updated = await prisma.article.update({
      where: { id },
      data: {
        pibApprovedAt: new Date(),
        pibApprovedById: session.user.id,
        pibReferenceNumber: ref,
      },
    });

    await logAudit({
      action: "article.pib_approve",
      resource: "article",
      resourceId: id,
      meta: { pibReferenceNumber: ref },
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json({ ok: true, article: updated });
  } catch (e) { return apiError(e); }
}
