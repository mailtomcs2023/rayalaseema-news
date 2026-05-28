import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getReporterId } from "@/lib/reporter-auth";
import { decryptProfileFields } from "@/lib/crypto/kyc";

// Returns the reporter's full profile (User + ReporterProfile) plus the
// list of their in-flight change requests so the app can render "Pending
// review" badges and any admin rejection notes inline.
//
// Per-field collapse: for each field we surface only the LATEST request,
// and only if it's still actionable (PENDING) or unresolved in the
// reporter's eyes (REJECTED). An older REJECTED that has since been
// superseded by an APPROVED request for the same field is dropped - the
// reporter has already moved on, and the new value is reflected on the
// profile object above.
export async function GET(req: NextRequest) {
  try {
    const reporterId = await getReporterId(req);
    if (!reporterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: reporterId },
      select: {
        id: true, name: true, email: true, phone: true, role: true, avatar: true,
        reporterProfile: true,
      },
    });
    if (!user || !user.reporterProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Pull recent history across every status so we can reason about
    // supersedence (an APPROVED request shadows older REJECTEDs for the
    // same field). 200 rows is plenty for any single reporter's profile.
    const recent = await prisma.profileUpdateRequest.findMany({
      where: { reporterProfileId: user.reporterProfile.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Group by field. Because the rows are sorted newest-first, the first
    // hit per field IS the latest one - no further sorting needed.
    const latestByField = new Map<string, (typeof recent)[number]>();
    for (const r of recent) {
      if (!latestByField.has(r.field)) latestByField.set(r.field, r);
    }

    // Only surface fields whose latest state is still actionable.
    const requests = Array.from(latestByField.values()).filter(
      (r) => r.status === "PENDING" || r.status === "REJECTED",
    );

    return NextResponse.json({
      user: {
        id: user.id, name: user.name, email: user.email, phone: user.phone,
        role: user.role, avatar: user.avatar,
      },
      // Decrypt PII before handing back to the mobile app - the reporter
      // sees their own data in plaintext on their device.
      profile: decryptProfileFields(user.reporterProfile),
      requests,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
