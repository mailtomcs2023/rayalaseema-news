// /api/content/[id]/reviewers — eligible sub-editors for this article's
// category, with their current open workload count. Powers the assignment
// panel on /content/[id] (admin/editor override).
//
// Returns the sub-editors sorted by load ascending so the dropdown's first
// option is the recommended pick. Includes the currently-assigned reviewer
// even if they're outside the article's category (they may have been
// manually assigned at some point).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;

    const article = await prisma.content.findUnique({
      where: { id },
      select: { categoryId: true, assignedReviewerId: true },
    });
    if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Eligible pool = active sub-editors in this article's category.
    const eligible = article.categoryId
      ? await prisma.user.findMany({
          where: {
            role: "SUB_EDITOR",
            active: true,
            assignedCategories: { some: { categoryId: article.categoryId } },
          },
          select: { id: true, name: true, email: true },
        })
      : [];

    // If the article is currently assigned to someone NOT in the eligible
    // pool (admin manually moved them, or they got removed from the category
    // after assignment), include them in the list so the UI shows the truth.
    if (article.assignedReviewerId && !eligible.find((u) => u.id === article.assignedReviewerId)) {
      const current = await prisma.user.findUnique({
        where: { id: article.assignedReviewerId },
        select: { id: true, name: true, email: true },
      });
      if (current) eligible.push(current);
    }

    const ids = eligible.map((u) => u.id);
    const counts =
      ids.length === 0
        ? []
        : await prisma.content.groupBy({
            by: ["assignedReviewerId"],
            where: {
              assignedReviewerId: { in: ids },
              status: { in: ["SUBMITTED", "IN_REVIEW"] },
            },
            _count: true,
          });
    const countMap = new Map<string, number>();
    for (const id of ids) countMap.set(id, 0);
    for (const c of counts as Array<{ assignedReviewerId: string | null; _count: number }>) {
      if (c.assignedReviewerId) countMap.set(c.assignedReviewerId, c._count);
    }

    const reviewers = eligible
      .map((u) => ({ ...u, openCount: countMap.get(u.id) ?? 0 }))
      .sort((a, b) => a.openCount - b.openCount);

    return NextResponse.json({
      assignedReviewerId: article.assignedReviewerId,
      reviewers,
    });
  } catch (error) {
    return apiError(error);
  }
}
