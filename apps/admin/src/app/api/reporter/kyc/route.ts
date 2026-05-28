import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getReporterId } from "@/lib/reporter-auth";
import { encrypt } from "@/lib/crypto/kyc";

// In-app KYC submission for the reporter (Expo) app.
//
// Two flows land here:
//
//   1. Admin-created reporter (kycStatus = PENDING): the reporter logs in,
//      sees the "Upload documents" card on Home, lands on /kyc, fills in
//      the form, hits Submit → this endpoint stores the docs and flips
//      status to SUBMITTED (admin then reviews on /journalists).
//
//   2. Rejected reporter (kycStatus = REJECTED): same screen, same payload,
//      but the existing rejectionNote is cleared so admin sees a fresh
//      submission rather than the stale rejection state.
//
// VERIFIED reporters cannot resubmit through here - their KYC is locked.
// Profile-field requests (e.g. updating Aadhaar after verification) go
// through the separate `/api/reporter/profile/request-change` flow which
// preserves the audit trail.
export async function PATCH(req: NextRequest) {
  const reporterId = await getReporterId(req);
  if (!reporterId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const {
      aadhaarNumber,
      aadhaarFrontUrl,
      aadhaarBackUrl,
      panNumber,
      panCardUrl,
      photoUrl,
    } = body as Record<string, string | undefined>;

    // All identity fields are mandatory for first-pass KYC submission.
    const missing: string[] = [];
    if (!aadhaarNumber || aadhaarNumber.replace(/\D/g, "").length !== 12) missing.push("Aadhaar number");
    if (!aadhaarFrontUrl) missing.push("Aadhaar front photo");
    if (!aadhaarBackUrl) missing.push("Aadhaar back photo");
    if (!panNumber || !/^[A-Z]{3}[CHFATBLJGP][A-Z]\d{4}[A-Z]$/.test(panNumber.toUpperCase())) missing.push("PAN number");
    if (!panCardUrl) missing.push("PAN card photo");
    if (!photoUrl) missing.push("Passport-size photo");
    if (missing.length) {
      return NextResponse.json(
        { error: `Missing: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const profile = await prisma.reporterProfile.findUnique({
      where: { userId: reporterId },
      select: { id: true, kycStatus: true },
    });
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    if (profile.kycStatus === "VERIFIED") {
      return NextResponse.json(
        { error: "Your KYC is already verified. Use Profile to request changes." },
        { status: 409 },
      );
    }

    await prisma.reporterProfile.update({
      where: { id: profile.id },
      data: {
        // Aadhaar + PAN encrypted at rest. Normalisation (strip dashes
        // from Aadhaar, uppercase PAN) happens BEFORE encrypt so the
        // ciphertext is canonical for the value the admin will see.
        aadhaarNumber: encrypt(aadhaarNumber!.replace(/\D/g, "")),
        aadhaarFrontUrl,
        aadhaarBackUrl,
        panNumber: encrypt(panNumber!.toUpperCase()),
        panCardUrl,
        photoUrl,
        kycStatus: "SUBMITTED",
        // Wipe any prior rejection note - the reporter has answered the feedback.
        kycRejectionNote: null,
      },
    });

    return NextResponse.json({ success: true, kycStatus: "SUBMITTED" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to submit KYC" }, { status: 500 });
  }
}
