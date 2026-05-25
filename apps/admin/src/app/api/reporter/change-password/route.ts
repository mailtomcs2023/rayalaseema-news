import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { hash, compare } from "bcryptjs";
import { getReporterId } from "@/lib/reporter-auth";
import { checkRateLimit } from "@/lib/rate-limit";

// Self-service password change for the reporter app. The account is identified
// by the bearer token; the current password is still required as a second
// check before the password is replaced.
export async function POST(req: NextRequest) {
  // Brute-force the current-password check is also a real risk if a token
  // gets stolen — limit to 10/min/IP same as login.
  const limited = checkRateLimit(req, { max: 10, windowMs: 60_000, prefix: "reporter-change-password" });
  if (limited) return limited;

  try {
    const reporterId = await getReporterId(req);
    if (!reporterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: reporterId } });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const valid = await compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }
    if (await compare(newPassword, user.passwordHash)) {
      return NextResponse.json({ error: "New password must differ from the current one" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(newPassword, 12) },
    });

    return NextResponse.json({ success: true, message: "Password updated" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
