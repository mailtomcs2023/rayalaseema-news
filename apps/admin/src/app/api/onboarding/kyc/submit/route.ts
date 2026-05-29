// Full KYC submit. The form auto-saves every field via PATCH, then hits
// this endpoint when the user clicks "Submit for review". We validate
// the required-fields rule here so partial saves stay possible without
// accidentally locking the user out of the form.
//
// Required for SUBMITTED → VERIFIED workflow:
//   Identity   - fullName, dateOfBirth, address, city, pincode, primaryDistrict
//   KYC docs   - aadhaarNumber (12 digits), aadhaarFront/Back URLs,
//                panNumber (canonical PAN regex), panCardUrl, photoUrl
//   Banking    - upiId, bankName, bankAccount, bankIfsc, bankBranch
//                (all required as of 2026-05; we can't push a payout
//                without them)

import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto/kyc";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^\d{9,18}$/;
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const PIN_RE = /^\d{6}$/;
const DOB_RE = /^\d{4}-\d{2}-\d{2}/;

export async function POST() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const profile = await prisma.reporterProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "No profile draft to submit - fill in your details first." },
        { status: 404 },
      );
    }
    if (profile.kycStatus === "VERIFIED") {
      return NextResponse.json(
        { error: "KYC is already verified." },
        { status: 409 },
      );
    }

    // Decrypt the encrypted PII fields BEFORE validating their format -
    // ciphertext won't match the 12-digit / PAN regex.
    const aadhaar = decrypt(profile.aadhaarNumber)?.replace(/\D/g, "") || "";
    const pan = (decrypt(profile.panNumber) || "").toUpperCase();
    const bankAccountPlain = decrypt(profile.bankAccount) || "";

    const missing: string[] = [];
    // Identity
    if (!profile.fullName?.trim()) missing.push("Full name");
    if (!profile.dateOfBirth || !DOB_RE.test(profile.dateOfBirth.toISOString().slice(0, 10))) missing.push("Date of birth");
    if (!profile.address?.trim()) missing.push("Address");
    if (!profile.city?.trim()) missing.push("City");
    if (!profile.pincode || !PIN_RE.test(profile.pincode)) missing.push("Pincode (6 digits)");
    if (!profile.primaryDistrict?.trim()) missing.push("Primary district");
    // KYC docs
    if (aadhaar.length !== 12) missing.push("Aadhaar number (12 digits)");
    if (!profile.aadhaarFrontUrl) missing.push("Aadhaar front photo");
    if (!profile.aadhaarBackUrl) missing.push("Aadhaar back photo");
    if (!/^[A-Z]{3}[CHFATBLJGP][A-Z]\d{4}[A-Z]$/.test(pan)) missing.push("PAN number");
    if (!profile.panCardUrl) missing.push("PAN card photo");
    if (!profile.photoUrl) missing.push("Passport-size photo");
    // Banking - all five fields required as of 2026-05.
    if (!profile.upiId || !UPI_RE.test(profile.upiId)) missing.push("UPI ID (name@bank)");
    if (!profile.bankName?.trim()) missing.push("Bank name");
    if (!bankAccountPlain || !ACCOUNT_RE.test(bankAccountPlain)) missing.push("Bank account (9-18 digits)");
    if (!profile.bankIfsc || !IFSC_RE.test(profile.bankIfsc)) missing.push("IFSC (e.g. SBIN0001234)");
    if (!profile.bankBranch?.trim()) missing.push("Bank branch");
    if (missing.length) {
      return NextResponse.json(
        { error: `Missing or invalid: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    await prisma.reporterProfile.update({
      where: { id: profile.id },
      data: { kycStatus: "SUBMITTED", kycRejectionNote: null },
    });
    await logAudit({
      action: "kyc.submit",
      resource: "reporterProfile",
      resourceId: profile.id,
      meta: { userId: session.user.id, from: profile.kycStatus, to: "SUBMITTED" },
      actor: session.user,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError(e);
  }
}
