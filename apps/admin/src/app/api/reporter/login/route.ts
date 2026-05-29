import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { compare } from "bcryptjs";
import { createReporterToken } from "@/lib/reporter-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { isRegistrationComplete } from "@/lib/reporter-registration";

// Mobile login for the reporter (Expo) app.
//
// Plain JSON in / JSON out - deliberately NOT the NextAuth web flow
// (CSRF token + credentials callback + session cookie + 302 redirect),
// which React Native's fetch cannot perform reliably. One POST, one JSON
// response with the user object the app stores locally.
export async function POST(req: NextRequest) {
  // Brute-force guard - 10 attempts per minute per IP. Enough headroom for a
  // reporter fat-fingering the password a few times, tight enough that
  // automated credential-stuffing has to wait ~6 seconds between guesses.
  const limited = checkRateLimit(req, { max: 10, windowMs: 60_000, prefix: "reporter-login" });
  if (limited) return limited;

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Case-insensitive lookup so capitalisation typed at login doesn't matter.
    // reporterProfile is pulled so we can return the reporter's KYC state
    // along with the token - the Expo app reads it from AsyncStorage and
    // shows a "KYC under verification" banner / gates Submit + Earnings
    // until kycStatus === "VERIFIED".
    const user = await prisma.user.findFirst({
      where: { email: { equals: String(email).trim(), mode: "insensitive" } },
      select: {
        id: true, name: true, email: true, role: true, active: true,
        phone: true, avatar: true, passwordHash: true, mustChangePassword: true,
        reporterProfile: {
          select: {
            kycStatus: true,
            kycRejectionNote: true,
            dateOfBirth: true,
            address: true,
            pincode: true,
          },
        },
      },
    });

    // Same response for "no such user" and "wrong password" - don't leak which.
    if (!user || !user.active || !(await compare(String(password), user.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Record the login time on the journalist profile (best-effort).
    await prisma.reporterProfile
      .updateMany({ where: { userId: user.id }, data: { lastActiveAt: new Date() } })
      .catch(() => {});

    return NextResponse.json({
      token: createReporterToken(user.id),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        kycStatus: user.reporterProfile?.kycStatus || "PENDING",
        kycRejectionNote: user.reporterProfile?.kycRejectionNote || null,
        mustChangePassword: user.mustChangePassword,
        registrationComplete: isRegistrationComplete(user.reporterProfile),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Login failed" }, { status: 500 });
  }
}
