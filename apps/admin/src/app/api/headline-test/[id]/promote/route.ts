import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// POST /api/headline-test/[id]/promote
//
// Decides the winner of a headline A/B test by click count and promotes
// the winning variant to Article.title. Stamps winnerVariant + winnerAt so
// the test row is closed. Ties: variant A wins (incumbent).
//
// Operator-triggered for now — cron loop is a follow-up.
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const test = await prisma.headlineTest.findUnique({ where: { id } });
    if (!test) return NextResponse.json({ error: "Test not found" }, { status: 404 });
    if (test.winnerVariant) return NextResponse.json({ error: "Already promoted", winnerVariant: test.winnerVariant }, { status: 409 });

    const winner = test.clicksB > test.clicksA ? "B" : "A";
    const newTitle = winner === "A" ? test.variantA : test.variantB;

    await prisma.$transaction([
      prisma.article.update({ where: { id: test.articleId }, data: { title: newTitle } }),
      prisma.headlineTest.update({
        where: { id }, data: { winnerVariant: winner, winnerAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true, winnerVariant: winner, promotedTitle: newTitle, clicksA: test.clicksA, clicksB: test.clicksB });
  } catch (e) { return apiError(e); }
}
