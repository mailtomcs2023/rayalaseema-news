// Page Builder (Spec #2) — list version snapshots for a template.
//   GET /api/page-builder/templates/[id]/versions
// Returns most-recent-first; layout JSON is included so the operator
// can do a preview-diff before restoring. The history page lazy-loads
// older entries via offset paging (the table caps at 100 by default).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const limit = Math.min(200, Number(req.nextUrl.searchParams.get("limit")) || 50);
    const versions = await prisma.templateVersion.findMany({
      where: { templateId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { editedBy: { select: { name: true, email: true } } },
    });
    return NextResponse.json(
      versions.map((v) => ({
        id: v.id,
        layout: v.layout,
        editNote: v.editNote,
        editedBy: v.editedBy ? { name: v.editedBy.name, email: v.editedBy.email } : null,
        createdAt: v.createdAt,
      })),
    );
  } catch (error) {
    return apiError(error);
  }
}
