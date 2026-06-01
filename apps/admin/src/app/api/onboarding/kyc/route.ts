// Admin-side KYC submission. Parallel to /api/reporter/kyc (which uses
// the mobile-app reporter token) - this one reuses the AuthJS session so
// editors / sub-editors / admins can finish KYC from the admin portal.
//
// GET   /api/onboarding/kyc          - return the actor's current draft so
//                                       the form can pre-fill.
// PATCH /api/onboarding/kyc          - partial save. Any subset of fields,
//                                       merged into the profile. Status
//                                       stays PENDING / REJECTED - does NOT
//                                       advance to SUBMITTED.
// POST  /api/onboarding/kyc/submit   - full submit. Validates required
//                                       fields server-side, encrypts PII,
//                                       flips status to SUBMITTED.
//
// PII fields (aadhaarNumber, panNumber, bankAccount) flow through
// lib/crypto/kyc encryption on write and are decrypted on GET so the
// admin sees their own data in plaintext.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { encrypt, decryptProfileFields } from "@/lib/crypto/kyc";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const profile = await prisma.reporterProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!profile) {
      // Pre-merge accounts that never got a profile row auto-created.
      // Lazily create one so the rest of the flow has something to write
      // against - no admin intervention required.
      const created = await prisma.reporterProfile.create({
        data: { userId: session.user.id, fullName: session.user.name },
      });
      return NextResponse.json({ profile: decryptProfileFields(created) });
    }
    return NextResponse.json({ profile: decryptProfileFields(profile) });
  } catch (e) {
    return apiError(e);
  }
}

// Editable fields on the onboarding form. Profile fields outside this set
// (kycStatus, verifiedAt, kycRejectionNote, userId) are admin-only and
// can't be touched via this route.
const EDITABLE_FIELDS = [
  "fullName", "fatherName", "dateOfBirth", "gender",
  "address", "city", "pincode", "primaryDistrict",
  "aadhaarNumber", "aadhaarFrontUrl", "aadhaarBackUrl",
  "panNumber", "panCardUrl", "photoUrl",
  "upiId", "bankName", "bankAccount", "bankIfsc", "bankBranch",
  "experience", "specialization",
] as const;

const ENCRYPTED_FIELDS = new Set(["aadhaarNumber", "panNumber", "bankAccount"]);

export async function PATCH(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const body = (await req.json()) as Record<string, unknown>;

    // Whitelist + transform: any unknown key is silently dropped, any PII
    // field is encrypted before persistence. Dates parsed from ISO strings.
    const data: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue;
      let value = body[field];
      if (field === "dateOfBirth" && typeof value === "string") {
        value = value ? new Date(value) : null;
      }
      if (ENCRYPTED_FIELDS.has(field) && typeof value === "string") {
        value = encrypt(value);
      }
      data[field] = value;
    }

    // Staff (admin / editor / sub-editor / user) self-edit policy: direct
    // save, no approval queue. The reporter approval flow (profile-update-
    // requests) lives at /api/reporter/* and is unaffected by this route.
    // We do NOT block VERIFIED here so the /profile/<section> edit pages
    // can reuse this same PATCH to persist later corrections.

    const upserted = await prisma.reporterProfile.upsert({
      where: { userId: session.user.id },
      update: data,
      create: { userId: session.user.id, fullName: session.user.name, ...data },
    });
    return NextResponse.json({ profile: decryptProfileFields(upserted) });
  } catch (e) {
    return apiError(e);
  }
}
