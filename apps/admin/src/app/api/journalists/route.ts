import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET all journalists with profiles
export async function GET() {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const journalists = await prisma.user.findMany({
      where: { role: "REPORTER" },
      include: {
        journalistProfile: true,
        _count: { select: { articles: true, payments: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(journalists);
  } catch (error) {
    return apiError(error);
  }
}

// POST - approve/reject KYC
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { profileId, action, note } = await req.json();
    if (!profileId || !action) return NextResponse.json({ error: "profileId and action required" }, { status: 400 });

    if (action === "verify") {
      await prisma.journalistProfile.update({
        where: { id: profileId },
        data: { kycStatus: "VERIFIED", verifiedAt: new Date() },
      });
    } else if (action === "reject") {
      await prisma.journalistProfile.update({
        where: { id: profileId },
        data: { kycStatus: "REJECTED", kycRejectionNote: note || "Documents not clear" },
      });
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
