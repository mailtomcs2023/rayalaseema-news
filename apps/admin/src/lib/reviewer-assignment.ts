// Auto-assignment of sub-editors to incoming articles. Stage 2 of the
// payment-flow build. The algorithm:
//
//   1. Look up all ACTIVE SUB_EDITOR users whose UserCategory rows include
//      the article's category.
//   2. Count their current "open" workload - Content rows where
//      assignedReviewerId === them AND status ∈ {SUBMITTED, IN_REVIEW}.
//      That's their backlog they haven't acted on yet. We deliberately
//      count ACROSS all their categories so a sub-editor on Politics +
//      Sports + Cinema doesn't get crushed compared to a single-category
//      colleague.
//   3. Pick the smallest count. Ties → random among the tied set.
//   4. If no sub-editor matches (none in the category, none active),
//      return null. Caller leaves assignedReviewerId = null and the
//      review queue falls back to the pool (any SE in the category sees
//      the article and can claim via the atomic CAS in /api/review).

import type { PrismaClient } from "@prisma/client";

interface PickOptions {
  // Use this Prisma client / transaction context. Pass `tx` when calling
  // from inside a `prisma.$transaction` callback so the workload count is
  // consistent with the rest of the transaction.
  tx?: { content: { groupBy: any; findMany?: any }; user: { findMany: any }; userCategory?: unknown };
}

/**
 * Returns the userId of the least-loaded sub-editor in `categoryId`, or null
 * if no sub-editor is assigned to that category (caller falls back to pool).
 *
 * Safe to call inside a transaction - pass the transaction client via
 * `opts.tx` and the workload count joins the transaction's snapshot.
 */
export async function pickLeastLoadedReviewer(
  prisma: PrismaClient,
  categoryId: string | null,
  opts: PickOptions = {},
): Promise<string | null> {
  if (!categoryId) return null;
  const db = (opts.tx ?? prisma) as PrismaClient;

  // Step 1 - active sub-editors in this category whose KYC is verified.
  // Unverified SEs are intentionally excluded - they can't see the review
  // queue (proxy.ts gate), so handing them an article would orphan it.
  // Once admin verifies them, they immediately become eligible.
  const reviewers = await db.user.findMany({
    where: {
      role: "SUB_EDITOR",
      active: true,
      assignedCategories: { some: { categoryId } },
      reporterProfile: { kycStatus: "VERIFIED" },
    },
    select: { id: true },
  });
  if (reviewers.length === 0) return null;
  const ids = reviewers.map((r) => r.id);
  // Short-circuit: one reviewer = no algorithm needed.
  if (ids.length === 1) return ids[0];

  // Step 2 - open workload count per reviewer (across all their categories).
  const counts = await db.content.groupBy({
    by: ["assignedReviewerId"],
    where: {
      assignedReviewerId: { in: ids },
      status: { in: ["SUBMITTED", "IN_REVIEW"] },
    },
    _count: true,
  });

  // Step 3 - build {id → count}, defaulting un-listed reviewers to 0.
  const countMap = new Map<string, number>();
  for (const id of ids) countMap.set(id, 0);
  for (const c of counts as Array<{ assignedReviewerId: string | null; _count: number }>) {
    if (c.assignedReviewerId) countMap.set(c.assignedReviewerId, c._count);
  }

  // Step 4 - find min, collect ties, pick random tiebreaker.
  let minCount = Infinity;
  const tied: string[] = [];
  for (const [id, count] of countMap.entries()) {
    if (count < minCount) {
      minCount = count;
      tied.length = 0;
      tied.push(id);
    } else if (count === minCount) {
      tied.push(id);
    }
  }
  return tied[Math.floor(Math.random() * tied.length)];
}

/**
 * Redistribute every SUBMITTED article assigned to `userId` across the
 * remaining active sub-editors. Called when a sub-editor is deactivated so
 * their backlog doesn't get stranded.
 *
 * For each affected article: clear assignedReviewerId, then run the
 * algorithm fresh against the article's category. Pass `tx` from the user
 * deactivation transaction for atomicity.
 */
export async function redistributeReviewerArticles(
  prisma: PrismaClient,
  userId: string,
  opts: PickOptions = {},
): Promise<{ reassigned: number; unassigned: number }> {
  const db = (opts.tx ?? prisma) as PrismaClient;

  // Only articles still actionable. APPROVED + PUBLISHED don't need a
  // reviewer anymore; REJECTED + DRAFT can be re-claimed by anyone later.
  const articles = await db.content.findMany({
    where: { assignedReviewerId: userId, status: { in: ["SUBMITTED", "IN_REVIEW"] } },
    select: { id: true, categoryId: true },
  });

  let reassigned = 0;
  let unassigned = 0;
  for (const a of articles) {
    const next = await pickLeastLoadedReviewer(prisma, a.categoryId, opts);
    await db.content.update({
      where: { id: a.id },
      data: { assignedReviewerId: next },
    });
    if (next) reassigned++;
    else unassigned++;
  }
  return { reassigned, unassigned };
}
