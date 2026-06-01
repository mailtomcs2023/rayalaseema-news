import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireCan, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/admin/profile-requests?status=PENDING&reporterId=<id>
//
// Lists reporter-initiated profile-change requests for admin review. Defaults
// to PENDING; pass ?status=ALL to see history. Includes the reporter's
// basic identity so the admin UI can render rows without a second lookup.
export async function GET(req: NextRequest) {
  const auth = await requireCan("profile-request.review");
  if (isAuthError(auth)) return auth;

  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status") || "PENDING";
    const reporterId = url.searchParams.get("reporterId");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);

    const where: any = {};
    if (statusParam !== "ALL") where.status = statusParam;
    // Note: the DB column on ProfileUpdateRequest is still `reporterProfileId`
    // (Prisma field). Only the public URL/query-param name changed.
    if (reporterId) where.reporterProfileId = reporterId;

    const requests = await prisma.profileUpdateRequest.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        reporterProfile: {
          select: {
            id: true, fullName: true, kycStatus: true,
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    const pendingCount = await prisma.profileUpdateRequest.count({ where: { status: "PENDING" } });

    return NextResponse.json({ requests, pendingCount });
  } catch (e) {
    return apiError(e);
  }
}
