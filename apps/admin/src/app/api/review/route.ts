import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { pickLeastLoadedReviewer } from "@/lib/reviewer-assignment";

// ============ /api/review ============
// Editorial review queue. Reads + writes the unified `Content` table.
//
// Payment lifecycle (Stage 1 — per-article amount set by sub-editor):
//   action=review  → article SUBMITTED → IN_REVIEW
//                    Requires `paymentAmount`. Creates (or refreshes) a
//                    ContentPayment row at status=CALCULATED so the reporter
//                    sees "Pending" in their earnings tab from this moment.
//   action=reject  → article → REJECTED
//                    ContentPayment flips to CANCELLED (row kept for audit).
//   action=approve → article IN_REVIEW → APPROVED
//                    No payment change — Editor approving doesn't pay out yet.
//   action=publish → article APPROVED → PUBLISHED
//                    ContentPayment → APPROVED, approvedById/At stamped.
//   action=unpublish → article PUBLISHED → DRAFT
//                     If payment was PAID → blocked (can't undo real money).
//                     If APPROVED → reverts to CALCULATED, approver cleared.
//   action=submit  → → SUBMITTED (no payment effect; SE re-sets on next review)
//   action=archive → → ARCHIVED (no payment effect)
//   action=return-to-se → article IN_REVIEW → SUBMITTED
//                     Editor sends a SE mistake back to the sub-editor with
//                     a note. Payment stays CALCULATED (SE can adjust amount
//                     on re-claim). assignedReviewerId is preserved so the
//                     same SE owns it; the row appears in their SUBMITTED tab
//                     with a "Returned by editor" badge.
//
// Atomic claim: action="review" uses an updateMany WHERE status="SUBMITTED"
// so two sub-editors clicking simultaneously can't both claim the row. The
// loser gets a clean 409, no double payment, no overlapping reviews.

// Helper — sentinel error that the outer catch maps to a status code.
class WorkflowError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// GET /api/review — articles pending review for current user
export async function GET(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const role = session.user.role;
    const userId = session.user.id;
    const status = req.nextUrl.searchParams.get("status") || "SUBMITTED";

    const where: any = { status, type: "ARTICLE" };

    if (role === "SUB_EDITOR") {
      // Sub-editor view: articles AUTO-ASSIGNED to them, plus the pool of
      // unassigned articles in their categories (the fallback when no
      // sub-editor was available at submit time). Anything assigned to a
      // different sub-editor is hidden — strict assignment, no poaching.
      const assignments = await prisma.userCategory.findMany({
        where: { userId },
        select: { categoryId: true },
      });
      const categoryIds = assignments.map((a) => a.categoryId);
      where.OR = [
        { assignedReviewerId: userId },
        { assignedReviewerId: null, categoryId: { in: categoryIds } },
      ];
    }
    // EDITOR and ADMIN see all.

    const articles = await prisma.content.findMany({
      where,
      include: {
        category: { select: { name: true, nameEn: true, color: true } },
        author: { select: { name: true } },
        // Surface the assigned reviewer so the queue can flag "mine" vs
        // "pool" rows and the editor/admin can see who's responsible.
        assignedReviewer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Counts must respect the same scoping as the list — otherwise a sub
    // editor's tab badge says "5" but the table shows their 2 visible rows.
    const countWhere: any = { type: "ARTICLE" };
    if (where.OR) countWhere.OR = where.OR;
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

// POST /api/review — take an editorial action on a Content row.
// Body: { articleId | contentId, action, note?, paymentAmount? }
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  try {
    const userId = session.user.id;
    const role = session.user.role;
    const body = await req.json();
    const articleId: string | undefined = body.articleId || body.contentId;
    const action: string = body.action;
    const note: string | undefined = body.note;
    const rawAmount = body.paymentAmount;

    if (!articleId || !action) {
      return NextResponse.json({ error: "articleId/contentId and action required" }, { status: 400 });
    }

    const TRANSITIONS: Record<string, { newStatus: string; allowedRoles: string[] }> = {
      submit:        { newStatus: "SUBMITTED",  allowedRoles: ["REPORTER", "SUB_EDITOR", "EDITOR", "ADMIN"] },
      review:        { newStatus: "IN_REVIEW",  allowedRoles: ["SUB_EDITOR", "EDITOR", "ADMIN"] },
      approve:       { newStatus: "APPROVED",   allowedRoles: ["EDITOR", "ADMIN"] },
      reject:        { newStatus: "REJECTED",   allowedRoles: ["SUB_EDITOR", "EDITOR", "ADMIN"] },
      publish:       { newStatus: "PUBLISHED",  allowedRoles: ["EDITOR", "ADMIN"] },
      unpublish:     { newStatus: "DRAFT",      allowedRoles: ["EDITOR", "ADMIN"] },
      archive:       { newStatus: "ARCHIVED",   allowedRoles: ["ADMIN"] },
      "return-to-se":{ newStatus: "SUBMITTED",  allowedRoles: ["EDITOR", "ADMIN"] },
    };

    const transition = TRANSITIONS[action];
    if (!transition) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    if (!transition.allowedRoles.includes(role)) {
      return NextResponse.json({ error: `${role} cannot ${action}` }, { status: 403 });
    }

    // Validate paymentAmount upfront for "review" — sub-editor MUST set one.
    let paymentAmount: number | null = null;
    if (action === "review") {
      const n = Number(rawAmount);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "paymentAmount required (≥ 0)" }, { status: 400 });
      }
      paymentAmount = n;
    }

    // return-to-se requires a non-empty note — the SE needs to know WHY it
    // came back. Reject empty/whitespace upfront before the transaction opens.
    if (action === "return-to-se") {
      if (!note || !String(note).trim()) {
        return NextResponse.json({ error: "Editor note is required to return to sub-editor" }, { status: 400 });
      }
    }

    // Everything below runs in a single transaction so a partial failure
    // never leaves the Content + Payment + AuditLog rows out of sync.
    const result = await prisma.$transaction(async (tx) => {
      const article = await tx.content.findUnique({
        where: { id: articleId },
        select: {
          id: true, type: true, status: true, categoryId: true, authorId: true,
          assignedReviewerId: true,
          payments: { select: { id: true, status: true } },
        },
      });
      if (!article || article.type !== "ARTICLE") {
        throw new WorkflowError(404, "Article not found");
      }
      const payment = article.payments[0]; // 1-1 in practice (contentId @unique)

      switch (action) {
        case "review": {
          // Stage 2 — strict assignment for SUB_EDITOR. They can claim only
          // their own assigned articles, OR pool articles (unassigned, in
          // their category) when no sub-editor was available at submit time.
          // EDITOR / ADMIN bypass this — they can claim anything.
          if (role === "SUB_EDITOR") {
            if (article.assignedReviewerId && article.assignedReviewerId !== userId) {
              throw new WorkflowError(403, "Assigned to another reviewer");
            }
            if (!article.assignedReviewerId) {
              if (!article.categoryId) {
                throw new WorkflowError(403, "Article has no category");
              }
              const inCat = await tx.userCategory.findFirst({
                where: { userId, categoryId: article.categoryId },
                select: { userId: true },
              });
              if (!inCat) throw new WorkflowError(403, "Article not in your assigned categories");
            }
          }

          // Atomic claim — only succeeds if still SUBMITTED AND either
          // assigned to me OR unassigned. Closes the race where two sub-
          // editors look at the pool simultaneously: whichever UPDATE lands
          // first sets assignedReviewerId=them, the other gets count=0.
          const claim = await tx.content.updateMany({
            where: {
              id: articleId,
              status: "SUBMITTED",
              OR: [
                { assignedReviewerId: userId },
                { assignedReviewerId: null },
              ],
            },
            data: {
              status: "IN_REVIEW",
              reviewedById: userId,
              reviewedAt: new Date(),
              assignedReviewerId: userId, // claim stamps ownership
            },
          });
          if (claim.count === 0) {
            throw new WorkflowError(409, "Already claimed or no longer in Submitted");
          }

          // Clear any editor-return note now that the SE has re-claimed —
          // the article is moving forward, the prior feedback is resolved.
          await tx.content.update({
            where: { id: articleId },
            data: { editorNote: null } as any,
          });

          // Upsert payment. baseAmount = totalAmount in v1 (no bonus/deductions).
          if (payment) {
            await tx.contentPayment.update({
              where: { id: payment.id },
              data: {
                baseAmount: paymentAmount!,
                totalAmount: paymentAmount!,
                status: "CALCULATED",
                note: note || null,
              },
            });
          } else {
            await tx.contentPayment.create({
              data: {
                contentId: articleId!,
                journalistId: article.authorId,
                baseAmount: paymentAmount!,
                totalAmount: paymentAmount!,
                currency: "INR",
                status: "CALCULATED",
                note: note || null,
              },
            });
          }
          break;
        }

        case "reject": {
          await tx.content.update({
            where: { id: articleId },
            data: { status: "REJECTED", rejectionNote: note || "Please revise.", editorNote: null } as any,
          });
          if (payment) {
            await tx.contentPayment.update({
              where: { id: payment.id },
              data: { status: "CANCELLED" },
            });
          }
          break;
        }

        case "approve": {
          await tx.content.update({
            where: { id: articleId },
            data: { status: "APPROVED", approvedById: userId, approvedAt: new Date(), editorNote: null } as any,
          });
          // Payment stays at CALCULATED — only publish flips it to APPROVED.
          break;
        }

        case "return-to-se": {
          // Editor sees a SE mistake and bounces it back. Revert to SUBMITTED
          // keeping the SAME assignedReviewerId so it lands in that SE's
          // queue (not redistributed). Payment stays CALCULATED — SE can
          // adjust amount on re-claim if needed.
          const bounce = await tx.content.updateMany({
            where: { id: articleId, status: "IN_REVIEW" },
            data: {
              status: "SUBMITTED",
              editorNote: String(note).trim(),
              // Clear reviewedAt/reviewedBy so the SE's next claim re-stamps fresh.
              reviewedAt: null,
              reviewedById: null,
            } as any,
          });
          if (bounce.count === 0) {
            throw new WorkflowError(409, "Article is no longer in In-Review");
          }
          break;
        }

        case "publish": {
          await tx.content.update({
            where: { id: articleId },
            data: { status: "PUBLISHED", publishedAt: new Date(), editorNote: null } as any,
          });
          // Only auto-approve payment if there's one and it isn't already paid.
          if (payment && payment.status !== "PAID") {
            await tx.contentPayment.update({
              where: { id: payment.id },
              data: {
                status: "APPROVED",
                approvedById: userId,
                approvedAt: new Date(),
              },
            });
          }
          break;
        }

        case "unpublish": {
          if (payment?.status === "PAID") {
            throw new WorkflowError(409, "Cannot unpublish — payment already settled");
          }
          await tx.content.update({
            where: { id: articleId },
            data: { status: "DRAFT" },
          });
          if (payment && payment.status === "APPROVED") {
            await tx.contentPayment.update({
              where: { id: payment.id },
              data: { status: "CALCULATED", approvedById: null, approvedAt: null },
            });
          }
          break;
        }

        case "submit": {
          // Re-run auto-assignment so the article goes to a fresh
          // least-loaded sub-editor (the original may now be overloaded or
          // out of the category). Stage 2.
          const nextReviewer = await pickLeastLoadedReviewer(prisma, article.categoryId, { tx });
          await tx.content.update({
            where: { id: articleId },
            data: { status: "SUBMITTED", assignedReviewerId: nextReviewer },
          });
          // Payment from a previous review cycle (now CANCELLED) is left as-is
          // — the sub-editor will re-set the amount on next "review" click.
          break;
        }

        case "archive": {
          await tx.content.update({
            where: { id: articleId },
            data: { status: "ARCHIVED", editorNote: null } as any,
          });
          break;
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: `content.review.${action}`,
          resource: "content",
          resourceId: articleId!,
          meta: {
            note: note || null,
            newStatus: transition.newStatus,
            ...(paymentAmount !== null ? { paymentAmount } : {}),
          },
        },
      });

      return { newStatus: transition.newStatus };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    if (e instanceof WorkflowError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return apiError(e);
  }
}
