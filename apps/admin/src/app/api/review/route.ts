import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/review - get articles pending review for current user
export async function GET(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const role = session.user.role;
    const userId = session.user.id;
    const status = req.nextUrl.searchParams.get("status") || "SUBMITTED";

    let where: any = { status };

    if (role === "SUB_EDITOR") {
      // Sub-editors see only articles in their assigned categories
      const assignments = await prisma.userCategory.findMany({
        where: { userId },
        select: { categoryId: true },
      });
      const categoryIds = assignments.map((a) => a.categoryId);
      where.categoryId = { in: categoryIds };
    }
    // EDITOR and ADMIN see all

    where.type = "ARTICLE";
    const articles = await prisma.content.findMany({
      where,
      include: {
        category: { select: { name: true, nameEn: true, color: true } },
        author: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const countWhere: any = { type: "ARTICLE" };
    if (where.categoryId) countWhere.categoryId = where.categoryId;
    const counts = await prisma.content.groupBy({
      by: ["status"],
      where: countWhere,
      _count: true,
    });
    const countMap: Record<string, number> = {};
    counts.forEach((c) => (countMap[c.status] = c._count));

    return NextResponse.json({ articles, counts: countMap });
  } catch (error) {
    return apiError(error);
  }
}

// POST /api/review - take action on an article
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  try {
    const userId = session.user.id;
    const role = session.user.role;

    const body = await req.json();
    const articleId: string | undefined = body.articleId || body.contentId;
    const { action, note } = body;
    if (!articleId || !action) return NextResponse.json({ error: "articleId/contentId and action required" }, { status: 400 });

    const article = await prisma.content.findUnique({ where: { id: articleId } });
    if (!article || article.type !== "ARTICLE") return NextResponse.json({ error: "Article not found" }, { status: 404 });

    // Status transitions based on action
    const transitions: Record<string, { newStatus: string; allowedRoles: string[] }> = {
      submit: { newStatus: "SUBMITTED", allowedRoles: ["REPORTER", "SUB_EDITOR", "EDITOR", "ADMIN"] },
      review: { newStatus: "IN_REVIEW", allowedRoles: ["SUB_EDITOR", "EDITOR", "ADMIN"] },
      approve: { newStatus: "APPROVED", allowedRoles: ["EDITOR", "ADMIN"] },
      reject: { newStatus: "REJECTED", allowedRoles: ["SUB_EDITOR", "EDITOR", "ADMIN"] },
      publish: { newStatus: "PUBLISHED", allowedRoles: ["EDITOR", "ADMIN"] },
      unpublish: { newStatus: "DRAFT", allowedRoles: ["EDITOR", "ADMIN"] },
      archive: { newStatus: "ARCHIVED", allowedRoles: ["ADMIN"] },
    };

    const transition = transitions[action];
    if (!transition) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    // Check role permission
    if (!transition.allowedRoles.includes(role)) {
      return NextResponse.json({ error: `${role} cannot ${action}` }, { status: 403 });
    }

    // Update article
    const updateData: any = { status: transition.newStatus };
    if (action === "reject") updateData.rejectionNote = note || "Please revise.";
    if (action === "review") updateData.reviewedById = userId;
    if (action === "review") updateData.reviewedAt = new Date();
    if (action === "approve") updateData.approvedById = userId;
    if (action === "approve") updateData.approvedAt = new Date();
    if (action === "publish") updateData.publishedAt = new Date();

    await prisma.content.update({ where: { id: articleId }, data: updateData });

    // Spec #1 A1C (#189) — ArticleReview table dropped. Log review actions
    // to AuditLog (the system-wide trail) instead.
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: `content.review.${action}`,
        resource: "content",
        resourceId: articleId,
        meta: { note: note || null, newStatus: transition.newStatus },
      },
    });

    return NextResponse.json({ success: true, newStatus: transition.newStatus });
  } catch (error) {
    return apiError(error);
  }
}
