import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getReporterId } from "@/lib/reporter-auth";
import { encrypt } from "@/lib/crypto/kyc";
import { isRegistrationComplete } from "@/lib/reporter-registration";

// "Complete registration" submission for the Expo app.
//
// Used when the reporter was created from the admin portal (name + email
// only) and signs in for the first time. The app walks them through the
// same 3-step flow as self-registration, but the user already exists, so
// we UPDATE rather than create. Email + password are intentionally not
// accepted here: the admin already set them, and a self-serve change of
// either has to go through the dedicated password / change-request flows.
export async function POST(req: NextRequest) {
  const reporterId = await getReporterId(req);
  if (!reporterId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      // Step 1 - personal
      fullName, phone, dateOfBirth, gender, address, city, pincode,
      primaryDistrict, experience,
      // Step 2 - KYC
      aadhaarNumber, aadhaarFrontUrl, aadhaarBackUrl,
      panNumber, panCardUrl, photoUrl,
      // Step 3 - bank / payout
      upiId, bankName, bankAccount, bankIfsc, bankBranch,
    } = body as Record<string, string | undefined>;

    // Same required-field set as self-registration step 1 + KYC, minus the
    // email / password that we own from the admin-create row.
    if (!fullName || !phone || !pincode) {
      return NextResponse.json(
        { error: "Name, phone and pincode are required" },
        { status: 400 },
      );
    }

    // Confirm the existing user is the one the token belongs to. We update
    // their name + phone here - admin only seeded name, and phone is on the
    // User row, not the profile.
    const existing = await prisma.user.findUnique({
      where: { id: reporterId },
      select: { id: true, reporterProfile: { select: { id: true, kycStatus: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // VERIFIED reporters shouldn't be hitting this endpoint - their KYC is
    // locked and profile edits go through /api/reporter/profile/request-change.
    if (existing.reporterProfile?.kycStatus === "VERIFIED") {
      return NextResponse.json(
        { error: "Your profile is already verified. Use Profile to request changes." },
        { status: 409 },
      );
    }

    const hasDocuments = !!(aadhaarFrontUrl || panCardUrl || photoUrl);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: reporterId },
        data: { name: fullName, phone },
      });

      const profileData = {
        fullName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender: gender || null,
        address: address || null,
        city: city || null,
        pincode,
        primaryDistrict: primaryDistrict || null,
        experience: experience || null,
        // PII encrypted at rest. encrypt() is a no-op on null/undefined,
        // so the docs-skipped case still ends up with null in the DB
        // rather than a ciphertext-of-empty-string.
        aadhaarNumber: encrypt(aadhaarNumber || null),
        aadhaarFrontUrl: aadhaarFrontUrl || null,
        aadhaarBackUrl: aadhaarBackUrl || null,
        panNumber: encrypt(panNumber || null),
        panCardUrl: panCardUrl || null,
        photoUrl: photoUrl || null,
        upiId: upiId || null,
        bankName: bankName || null,
        bankAccount: encrypt(bankAccount || null),
        bankIfsc: bankIfsc || null,
        bankBranch: bankBranch || null,
        // Flip to SUBMITTED when docs are present; otherwise leave whatever
        // the prior status was (admin-created starts at PENDING).
        ...(hasDocuments ? { kycStatus: "SUBMITTED" as const, kycRejectionNote: null } : {}),
      };

      if (existing.reporterProfile) {
        await tx.reporterProfile.update({
          where: { id: existing.reporterProfile.id },
          data: profileData,
        });
      } else {
        await tx.reporterProfile.create({
          data: { userId: reporterId, ...profileData, languages: ["Telugu"] },
        });
      }
    });

    // Reflect the new state back so the app can update its cached user row
    // in a single response (no follow-up /profile fetch needed).
    return NextResponse.json({
      success: true,
      kycStatus: hasDocuments ? "SUBMITTED" : (existing.reporterProfile?.kycStatus || "PENDING"),
      registrationComplete: isRegistrationComplete({
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        address: address || null,
        pincode,
      }),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to complete registration" },
      { status: 500 },
    );
  }
}
