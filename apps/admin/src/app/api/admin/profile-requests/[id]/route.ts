import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { KycStatus } from "@rayalaseema/db";
import { requireCan, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import {
  PROFILE_FIELDS,
  isValidField,
  deserializeForWrite,
} from "@/lib/profile-fields";

// POST /api/admin/profile-requests/[id]  { action: "approve" | "reject", note? }
//
// Approve: write the new value to its target table (User or ReporterProfile).
//   For KYC-critical fields the journalist's kycStatus is set to VERIFIED
//   and verifiedAt is stamped (admin is implicitly re-verifying by approving).
//
// Reject: leave the journalist value unchanged. For KYC-critical fields,
//   restore the kycStatus we paused on submission (previousKycStatus).
//
// Both paths mark the request reviewed and emit an AuditLog entry.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCan("profile-request.decide");
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const body = await req.json();
    const action: "approve" | "reject" = body?.action;
    const note: string | undefined = typeof body?.note === "string" ? body.note.trim() : undefined;

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const request = await prisma.profileUpdateRequest.findUnique({
      where: { id },
      include: { reporterProfile: { include: { user: true } } },
    });
    if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Request is not pending" }, { status: 409 });
    }
    if (!isValidField(request.field)) {
      return NextResponse.json({ error: "Field is no longer supported" }, { status: 400 });
    }
    const def = PROFILE_FIELDS[request.field];
    const profile = request.reporterProfile;
    if (!profile) return NextResponse.json({ error: "Journalist profile missing" }, { status: 500 });

    const now = new Date();
    const isKycCritical = def.critical === "kyc";

    await prisma.$transaction(async (tx) => {
      if (action === "approve") {
        const newValue = deserializeForWrite(def, request.newValue);

        if (def.model === "user") {
          await tx.user.update({
            where: { id: profile.user.id },
            data: { [def.column]: newValue } as any,
          });
        } else {
          const updateData: any = { [def.column]: newValue };
          if (isKycCritical) {
            updateData.kycStatus = KycStatus.VERIFIED;
            updateData.verifiedAt = now;
            updateData.kycRejectionNote = null;
          }
          await tx.reporterProfile.update({
            where: { id: profile.id },
            data: updateData,
          });
        }

        await tx.profileUpdateRequest.update({
          where: { id },
          data: {
            status: "APPROVED",
            reviewerNote: note || null,
            reviewedById: auth.user.id,
            reviewedAt: now,
          },
        });
      } else {
        // Reject: restore the kycStatus we paused on submission, if any.
        if (request.previousKycStatus) {
          await tx.reporterProfile.update({
            where: { id: profile.id },
            data: { kycStatus: request.previousKycStatus },
          });
        }

        await tx.profileUpdateRequest.update({
          where: { id },
          data: {
            status: "REJECTED",
            reviewerNote: note || null,
            reviewedById: auth.user.id,
            reviewedAt: now,
          },
        });
      }
    });

    await logAudit({
      action: action === "approve" ? "profile.request.approve" : "profile.request.reject",
      resource: "journalist_profile",
      resourceId: profile.id,
      meta: {
        requestId: id,
        field: request.field,
        from: request.oldValue,
        to: request.newValue,
        note: note || null,
        kycPausedAndRestored: action === "reject" && !!request.previousKycStatus,
        kycReVerified: action === "approve" && isKycCritical,
      },
      actor: { id: auth.user.id, email: auth.user.email, role: auth.user.role },
      req,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError(e);
  }
}
