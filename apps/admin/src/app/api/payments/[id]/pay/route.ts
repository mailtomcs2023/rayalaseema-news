// /api/payments/[id]/pay - admin flips an APPROVED payment to PAID after the
// real bank transfer has gone out. Captures the transactionId + paymentMethod
// for the reporter to see ("Settled - paid on 2026-05-26 via UPI · txn123").
//
// Admin-only. Atomic conditional update - only flips APPROVED → PAID, so
// trying to pay a CANCELLED or already-PAID row returns 409 cleanly.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

const VALID_METHODS = ["UPI", "BANK", "CHEQUE"] as const;
type PaymentMethod = (typeof VALID_METHODS)[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id: paymentId } = await params;
    const body = await req.json().catch(() => ({}));
    const paymentMethod = body.paymentMethod as PaymentMethod | undefined;
    const transactionId: string | undefined = body.transactionId?.toString().trim() || undefined;

    if (!paymentMethod || !VALID_METHODS.includes(paymentMethod)) {
      return NextResponse.json(
        { error: `paymentMethod required (one of: ${VALID_METHODS.join(", ")})` },
        { status: 400 },
      );
    }

    const userId = session.user.id;

    const result = await prisma.$transaction(async (tx) => {
      // Atomic flip - only succeeds if currently APPROVED. Loser gets 409.
      const claim = await tx.contentPayment.updateMany({
        where: { id: paymentId, status: "APPROVED" },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paymentMethod,
          transactionId,
        },
      });
      if (claim.count === 0) {
        const err: any = new Error(
          "Payment not in APPROVED state (already paid, cancelled, or article not yet published)",
        );
        err.status = 409;
        throw err;
      }

      const updated = await tx.contentPayment.findUnique({ where: { id: paymentId } });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "content.payment.pay",
          resource: "content_payment",
          resourceId: paymentId,
          meta: {
            paymentMethod,
            transactionId: transactionId || null,
            amount: updated?.totalAmount ?? null,
          },
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
