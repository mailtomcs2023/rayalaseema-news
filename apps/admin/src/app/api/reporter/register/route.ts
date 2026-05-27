import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { hash } from "bcryptjs";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  // 5 registrations per IP per hour is plenty for a real user and tight
  // enough that scripted account-farming is uncomfortable.
  const limited = checkRateLimit(req, { max: 5, windowMs: 60 * 60_000, prefix: "reporter-register" });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { fullName, email, phone, password, dateOfBirth, gender, address, city, pincode,
      primaryDistrict, aadhaarNumber, aadhaarFrontUrl, aadhaarBackUrl, panNumber, panCardUrl,
      photoUrl, experience } = body;

    // Banking details (upiId / bankName / bankAccount / bankIfsc) are
    // intentionally NOT accepted here. A self-serve registration page can't
    // prove the reporter actually owns the account they typed, so accepting
    // them would let one reporter route payouts to someone else's UPI/IFSC.
    // Admin captures + verifies these during KYC review instead.
    // (Old app builds still POST them in the body; we silently ignore.)

    if (!fullName || !email || !phone || !password) {
      return NextResponse.json({ error: "Name, email, phone, password required" }, { status: 400 });
    }

    // Canonicalise email before the uniqueness check + write. Without this
    // `Foo@Gmail.com` and `foo@gmail.com` would slip past the unique
    // constraint as two separate users — same human, two accounts, two
    // sets of articles, no way to recover.
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check if email exists (against the normalised form).
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) return NextResponse.json({ error: "Email already registered" }, { status: 400 });

    // Create user
    const passwordHash = await hash(password, 12);
    const user = await prisma.user.create({
      data: { email: cleanEmail, name: fullName, passwordHash, role: "REPORTER", phone, active: true },
    });

    // Create journalist profile with KYC
    const hasDocuments = aadhaarFrontUrl || panCardUrl || photoUrl;

    await prisma.journalistProfile.create({
      data: {
        userId: user.id,
        fullName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender, address, city, pincode,
        primaryDistrict: primaryDistrict || null,
        kycStatus: hasDocuments ? "SUBMITTED" : "PENDING",
        aadhaarNumber, aadhaarFrontUrl, aadhaarBackUrl,
        panNumber, panCardUrl, photoUrl,
        experience,
        languages: ["Telugu"],
      },
    });

    return NextResponse.json({
      success: true,
      message: "Registration successful. KYC under review.",
      userId: user.id,
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
