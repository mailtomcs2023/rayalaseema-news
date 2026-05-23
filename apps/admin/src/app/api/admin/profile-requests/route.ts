import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/admin/profile-requests?status=PENDING&journalistId=<id>
//
// Lists reporter-initiated profile-change requests for admin review. Defaults
// to PENDING; pass ?status=ALL to see history. Includes the journalist's
// basic identity so the admin UI can render rows without a second lookup.
export async function GET(req: NextRequest) {
  const auth = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(auth)) return auth;

  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status") || "PENDING";
    const journalistId = url.searchParams.get("journalistId");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);

    const where: any = {};
    if (statusParam !== "ALL") where.status = statusParam;
    if (journalistId) where.journalistProfileId = journalistId;

    const requests = await prisma.profileUpdateRequest.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        journalistProfile: {
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
