// /api/reporter/earnings - payment-centric view of the signed-in reporter's
// articles. Returns four buckets the mobile + web Earnings screens render
// as tabs, plus a per-category breakdown for the "what's my best category"
// comparison.
//
// Pending   = CALCULATED (sub-editor set the amount, article in review)
// Approved  = APPROVED   (article published, awaiting payout)
// Settled   = PAID       (money transferred)
// Cancelled = CANCELLED  (sub-editor rejected after setting an amount - we
//                         keep the row visible so the reporter sees what
//                         happened, with the rejection note attached)
// PROCESSING + DISPUTED are unused in v1 and skipped.
//
// KYC-gated: only VERIFIED reporters see real numbers. PENDING / SUBMITTED /
// REJECTED reporters get an empty payload with `locked: true` so the screen
// can render a "locked until KYC" state instead of fake zeros.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getReporterId } from "@/lib/reporter-auth";

interface ApiPaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: "CALCULATED" | "APPROVED" | "PAID" | "CANCELLED";
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
  note: string | null;
  // The reporter sees this when CANCELLED so they understand WHY the
  // payment was voided. Lives on Content, not ContentPayment, but we
  // project it onto every row for the front-end's convenience.
  rejectionNote: string | null;
  article: {
    id: string;
    title: string;
    slug: string | null;
    category: { name: string; nameEn: string; slug: string; color: string | null } | null;
  };
}

interface ApiCategoryTotal {
  slug: string;
  name: string;
  nameEn: string;
  color: string | null;
  total: number;
  count: number;
}

function emptyPayload(extras: object) {
  return {
    totals: { pending: 0, approved: 0, settled: 0, cancelled: 0 },
    pending: [] as ApiPaymentRow[],
    approved: [] as ApiPaymentRow[],
    settled: [] as ApiPaymentRow[],
    cancelled: [] as ApiPaymentRow[],
    byCategory: [] as ApiCategoryTotal[],
    ...extras,
  };
}

export async function GET(req: NextRequest) {
  const reporterId = await getReporterId(req);
  if (!reporterId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const jp = await prisma.reporterProfile.findUnique({
      where: { userId: reporterId },
      select: { kycStatus: true },
    });
    if (!jp || jp.kycStatus !== "VERIFIED") {
      return NextResponse.json(
        emptyPayload({ locked: true, kycStatus: jp?.kycStatus || "PENDING" }),
      );
    }

    const payments = await prisma.contentPayment.findMany({
      where: {
        journalistId: reporterId,
        // Include CANCELLED so the reporter sees the full lifecycle. The
        // article's rejectionNote is pulled in below so they understand
        // WHY a previously-pending payment got voided.
        status: { in: ["CALCULATED", "APPROVED", "PAID", "CANCELLED"] },
      },
      include: {
        content: {
          select: {
            id: true,
            title: true,
            slug: true,
            rejectionNote: true,
            category: { select: { name: true, nameEn: true, slug: true, color: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const toApi = (p: (typeof payments)[number]): ApiPaymentRow => ({
      id: p.id,
      amount: p.totalAmount,
      currency: p.currency,
      status: p.status as "CALCULATED" | "APPROVED" | "PAID" | "CANCELLED",
      createdAt: p.createdAt.toISOString(),
      approvedAt: p.approvedAt?.toISOString() ?? null,
      paidAt: p.paidAt?.toISOString() ?? null,
      paymentMethod: p.paymentMethod ?? null,
      transactionId: p.transactionId ?? null,
      note: p.note ?? null,
      rejectionNote: p.content.rejectionNote ?? null,
      article: {
        id: p.content.id,
        title: p.content.title,
        slug: p.content.slug,
        // Category.nameEn is nullable in the schema; fall back to the Telugu
        // `name` so every UI gets a non-null display string without per-site
        // null checks.
        category: p.content.category
          ? {
              slug: p.content.category.slug,
              name: p.content.category.name,
              nameEn: p.content.category.nameEn ?? p.content.category.name,
              color: p.content.category.color ?? null,
            }
          : null,
      },
    });

    const pending: ApiPaymentRow[] = [];
    const approved: ApiPaymentRow[] = [];
    const settled: ApiPaymentRow[] = [];
    const cancelled: ApiPaymentRow[] = [];
    for (const p of payments) {
      const row = toApi(p);
      if (p.status === "CALCULATED") pending.push(row);
      else if (p.status === "APPROVED") approved.push(row);
      else if (p.status === "PAID") settled.push(row);
      else if (p.status === "CANCELLED") cancelled.push(row);
    }

    // Per-category totals - only counts PAID rows so reporters compare
    // *realised* income, not pending estimates. Sorted high → low so the
    // first entry is their best-earning category.
    const byCategoryMap = new Map<string, ApiCategoryTotal>();
    for (const p of payments) {
      if (p.status !== "PAID") continue;
      const c = p.content.category;
      if (!c) continue;
      const existing = byCategoryMap.get(c.slug);
      if (existing) {
        existing.total += p.totalAmount;
        existing.count += 1;
      } else {
        byCategoryMap.set(c.slug, {
          slug: c.slug,
          name: c.name,
          nameEn: c.nameEn ?? c.name,
          color: c.color ?? null,
          total: p.totalAmount,
          count: 1,
        });
      }
    }
    const byCategory = [...byCategoryMap.values()].sort((a, b) => b.total - a.total);

    return NextResponse.json({
      totals: {
        pending: pending.reduce((s, r) => s + r.amount, 0),
        approved: approved.reduce((s, r) => s + r.amount, 0),
        settled: settled.reduce((s, r) => s + r.amount, 0),
        cancelled: cancelled.reduce((s, r) => s + r.amount, 0),
      },
      pending,
      approved,
      settled,
      cancelled,
      byCategory,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load earnings" }, { status: 500 });
  }
}
