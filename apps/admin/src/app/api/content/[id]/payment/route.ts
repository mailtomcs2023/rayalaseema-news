// /api/content/[id]/payment - adjust the per-article payment amount after
// the sub-editor's initial set. Used by the payment panel on /content/[id]
// and by inline edits on /payments.
//
// Editor + Admin only. Sub-editors can only set the amount via the
// "Mark in review" action - not edit after the fact.
//
// Blocked once the payment has been settled (PAID) - at that point the bank
// transfer has already happened and the amount is historical fact.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET - the payment for one content row. Returns `null` if no payment row
// exists yet (the sub-editor hasn't picked up the article for review).
// Used by the payment panel on /content/[id].
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id: contentId } = await params;
    const payment = await prisma.contentPayment.findUnique({
      where: { contentId },
      include: { journalist: { select: { id: true, name: true } } },
    });
    return NextResponse.json(payment ?? null);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id: contentId } = await params;
    const body = await req.json();
    const rawAmount = body.baseAmount;
    const note: string | undefined = body.note;

    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "baseAmount required (≥ 0)" }, { status: 400 });
    }

    const userId = session.user.id;

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.contentPayment.findUnique({
        where: { contentId },
        select: { id: true, baseAmount: true, status: true },
      });
      if (!payment) {
        const err: any = new Error("No payment row - sub-editor hasn't set an amount yet");
        err.status = 404;
        throw err;
      }
      if (payment.status === "PAID") {
        const err: any = new Error("Payment already settled - amount cannot be changed");
        err.status = 409;
        throw err;
      }

      const before = payment.baseAmount;
      const updated = await tx.contentPayment.update({
        where: { id: payment.id },
        data: {
          baseAmount: amount,
          totalAmount: amount, // bonus + deductions are zero in v1
          note: note ?? undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "content.payment.edit",
          resource: "content",
          resourceId: contentId,
          meta: { before, after: amount, note: note ?? null },
        },
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error?.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiError(error);
  }
}
