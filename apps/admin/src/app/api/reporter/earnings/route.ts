import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getReporterId } from "@/lib/reporter-auth";

// Earnings for the reporter app — the signed-in reporter's article payments
// plus a summary. Token-protected (identity comes from the bearer token).
export async function GET(req: NextRequest) {
  const reporterId = getReporterId(req);
  if (!reporterId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const payments = await prisma.articlePayment.findMany({
      where: { journalistId: reporterId },
      include: {
        article: { select: { title: true, slug: true } },
        config: { select: { name: true, articleType: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const total = payments.reduce((s, p) => s + p.totalAmount, 0);
    const paid = payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.totalAmount, 0);
    const pending = payments
      .filter((p) => ["CALCULATED", "APPROVED", "PROCESSING"].includes(p.status))
      .reduce((s, p) => s + p.totalAmount, 0);
    const thisMonth = payments
      .filter((p) => new Date(p.createdAt) >= monthStart)
      .reduce((s, p) => s + p.totalAmount, 0);

    return NextResponse.json({
      payments,
      summary: {
        total: Math.round(total),
        paid: Math.round(paid),
        pending: Math.round(pending),
        thisMonth: Math.round(thisMonth),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load earnings" }, { status: 500 });
  }
}
