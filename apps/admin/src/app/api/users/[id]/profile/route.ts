// GET /api/users/[id]/profile
//
// Single-user fetch used by the KYC review dialog on /users. Returns the
// full ReporterProfile (decrypted PII) + activity counts so the dialog
// can render documents, banking, KYC decision controls without a second
// round-trip. The /users list endpoint keeps a slim profile select to
// avoid loading every user's PII into memory.
//
// Returns `reporterProfile: null` when the user has no profile row yet
// (older accounts created before the auto-profile rule landed). The
// dialog renders a "No KYC profile yet" message in that case.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireCan, isAuthError, apiError } from "@/lib/api-utils";
import { decryptProfileFields } from "@/lib/crypto/kyc";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCan("user.manage");
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        reporterProfile: {
          include: {
            _count: {
              select: { profileUpdateRequests: { where: { status: "PENDING" as const } } },
            },
          },
        },
        _count: { select: { contents: true, contentPayments: true } },
      },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({
      ...user,
      reporterProfile: user.reporterProfile ? decryptProfileFields(user.reporterProfile) : null,
    });
  } catch (e) {
    return apiError(e);
  }
}
