// /api/payments - list ContentPayment rows for the admin /payments page.
// Admin-only. Optional `status` filter ("ALL" or any PaymentStatus value).
//
// Each row joins through Content so the table can show article title +
// category + reporter without N+1 lookups.
import { NextRequest, NextResponse } from "next/server";
import { prisma, PaymentStatus } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

const VALID_STATUSES = new Set(Object.values(PaymentStatus));

export async function GET(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const statusParam = (searchParams.get("status") || "ALL").toUpperCase();
    const limit = Math.min(parseInt(searchParams.get("limit") || "100") || 100, 500);

    const where: any = {};
    if (statusParam !== "ALL") {
      if (!VALID_STATUSES.has(statusParam as any)) {
        return NextResponse.json({ error: `Invalid status '${statusParam}'` }, { status: 400 });
      }
      where.status = statusParam;
    }

    const payments = await prisma.contentPayment.findMany({
      where,
      include: {
        content: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            category: { select: { name: true, nameEn: true, slug: true, color: true } },
          },
        },
        journalist: { select: { id: true, name: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    const counts = await prisma.contentPayment.groupBy({
      by: ["status"],
      _count: true,
    });
    const countMap: Record<string, number> = {};
    counts.forEach((c) => (countMap[c.status] = c._count));

    return NextResponse.json({ payments, counts: countMap });
  } catch (error) {
    return apiError(error);
  }
}
