import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { KycStatus } from "@rayalaseema/db";
import { getReporterId } from "@/lib/reporter-auth";
import { decryptProfileFields } from "@/lib/crypto/kyc";
import {
  PROFILE_FIELDS,
  LOCKED_FIELDS,
  isValidField,
  serializeForStorage,
  valueToStorage,
  getCurrentValue,
  newKycStatusOnRequest,
} from "@/lib/profile-fields";

// POST { field, value } - reporter requests a change to a single field.
//
// Behaviour:
// - email / role / kycStatus are rejected (admin-only).
// - Unknown fields are rejected (400).
// - The value is validated by the field registry; on success a PENDING
//   ProfileUpdateRequest is created. If one already PENDING for the same
//   (reporter, field) exists, it's replaced (deleted + recreated).
// - KYC-critical fields (Aadhaar/PAN numbers and document photos) flip the
//   reporter's kycStatus from VERIFIED -> SUBMITTED on submission, pausing
//   earnings until admin verifies. The previous status is saved on the
//   request so we can restore it if admin rejects.
export async function POST(req: NextRequest) {
  try {
    const reporterId = await getReporterId(req);
    if (!reporterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const field: string = body?.field;
    const value: unknown = body?.value;

    if (!field || typeof field !== "string") {
      return NextResponse.json({ error: "field is required" }, { status: 400 });
    }
    if (LOCKED_FIELDS.has(field)) {
      return NextResponse.json(
        { error: "This field cannot be changed from the app. Please contact admin." },
        { status: 403 }
      );
    }
    if (!isValidField(field)) {
      return NextResponse.json({ error: "Unknown field" }, { status: 400 });
    }
    const def = PROFILE_FIELDS[field];

    const err = def.validate(value);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: reporterId },
      include: { reporterProfile: true },
    });
    if (!user || !user.reporterProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const profile = user.reporterProfile;

    // Decrypt PII fields before capturing the "before" value into the
    // ProfileUpdateRequest row, so the admin sees plaintext in both the
    // old + new columns when reviewing. The live profile keeps its
    // encrypted storage; we only decrypt for this transient request row.
    const decryptedProfile = decryptProfileFields(profile);
    const currentValue = getCurrentValue({ ...decryptedProfile, user }, def);
    const newStored = serializeForStorage(def, value);
    const oldStored = valueToStorage(def, currentValue);

    if (newStored === oldStored) {
      return NextResponse.json({ error: "New value is the same as current value" }, { status: 400 });
    }

    // Atomically replace any pending request for the same field, create the
    // new one, and pause KYC if this is a KYC-critical change.
    const newKyc = newKycStatusOnRequest(def, profile.kycStatus);

    const result = await prisma.$transaction(async (tx) => {
      await tx.profileUpdateRequest.deleteMany({
        where: { reporterProfileId: profile.id, field, status: "PENDING" },
      });

      const created = await tx.profileUpdateRequest.create({
        data: {
          reporterProfileId: profile.id,
          field,
          oldValue: oldStored,
          newValue: newStored,
          status: "PENDING",
          previousKycStatus: newKyc ? profile.kycStatus : null,
        },
      });

      if (newKyc) {
        await tx.reporterProfile.update({
          where: { id: profile.id },
          data: { kycStatus: newKyc },
        });
      }

      return created;
    });

    return NextResponse.json({
      success: true,
      request: result,
      kycPaused: newKyc === KycStatus.SUBMITTED,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/reporter/profile/request-change?field=phone - withdraw a
// pending request. If it was KYC-critical and we paused the reporter's
// KYC, restore the previous status.
export async function DELETE(req: NextRequest) {
  try {
    const reporterId = await getReporterId(req);
    if (!reporterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const field = new URL(req.url).searchParams.get("field");
    if (!field) return NextResponse.json({ error: "field is required" }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: reporterId },
      include: { reporterProfile: true },
    });
    if (!user?.reporterProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const profile = user.reporterProfile;

    const pending = await prisma.profileUpdateRequest.findFirst({
      where: { reporterProfileId: profile.id, field, status: "PENDING" },
    });
    if (!pending) {
      return NextResponse.json({ error: "No pending request for that field" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.profileUpdateRequest.delete({ where: { id: pending.id } });
      if (pending.previousKycStatus) {
        await tx.reporterProfile.update({
          where: { id: profile.id },
          data: { kycStatus: pending.previousKycStatus },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
