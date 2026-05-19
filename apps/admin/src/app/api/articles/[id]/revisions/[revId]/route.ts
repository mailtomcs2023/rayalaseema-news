import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/articles/[id]/revisions/[revId] — full revision content for preview/diff
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string; revId: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id, revId } = await params;
    const rev = await prisma.articleRevision.findUnique({
      where: { id: revId },
      include: { editedBy: { select: { id: true, name: true, email: true } } },
    });
    if (!rev || rev.articleId !== id) return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    return NextResponse.json(rev);
  } catch (error) {
    return apiError(error);
  }
}
