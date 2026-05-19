import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const userId = session.user.id;

    const payments = await prisma.articlePayment.findMany({
      where: { journalistId: userId },
      include: {
        article: { select: { title: true, slug: true } },
        config: { select: { name: true, articleType: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const total = payments.reduce((s, p) => s + p.totalAmount, 0);
    const paid = payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.totalAmount, 0);
    const pending = payments.filter((p) => ["CALCULATED", "APPROVED"].includes(p.status)).reduce((s, p) => s + p.totalAmount, 0);
    const thisMonth = payments.filter((p) => new Date(p.createdAt) >= thisMonthStart).reduce((s, p) => s + p.totalAmount, 0);

    return NextResponse.json({
      payments,
      summary: { total: Math.round(total), paid: Math.round(paid), pending: Math.round(pending), thisMonth: Math.round(thisMonth) },
    });
  } catch (error) {
    return apiError(error);
  }
}
