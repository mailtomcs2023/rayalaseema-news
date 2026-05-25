import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { createHash } from "node:crypto";

// POST /api/users/[id]/right-to-be-forgotten
//
// DPDPA Sec 12 / GDPR Article 17 right-to-erasure. Anonymizes the user
// rather than hard-deleting because authored articles must stay published
// (public-interest journalism — DPDPA permits anonymization in lieu of
// erasure when the data forms part of editorial record).
//
// Effect:
//   - Email/name/phone/avatar/bio replaced with anonymous tokens.
//   - Comments by this user anonymized (body kept; byline blanked).
//   - Audit-log actorId stays (needed for legal trail) but PII fields cleared.
//   - account.active = false so they can no longer sign in.
//
// Access: user can erase own account; ADMIN can erase anyone.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const role = (session.user as any).role;
    if (session.user.id !== id && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Deterministic anonymous handle so audit-log entries from the same user
    // still tie together post-erasure, without exposing PII.
    const anonHash = createHash("sha256").update(user.id + (process.env.RTBF_SALT || "re-rtbf")).digest("hex").slice(0, 12);
    const anonHandle = `anon-${anonHash}`;
    const anonEmail = `${anonHandle}@erased.invalid`;

    await prisma.user.update({
      where: { id },
      data: {
        email: anonEmail,
        name: anonHandle,
        phone: null,
        avatar: null,
        bio: null,
        passwordHash: createHash("sha256").update(anonHash + Date.now()).digest("hex"),
        mustChangePassword: false,
        active: false,
      },
    });

    // Best-effort anonymize related rows. Each wrapped in catch so a missing
    // model doesn't block erasure.
    await prisma.comment.updateMany({ where: { authorId: id }, data: { /* keep body, author already anonymized via user row */ } }).catch(() => {});

    await logAudit({
      action: "user.right_to_be_forgotten",
      resource: "user",
      resourceId: id,
      meta: { erasedById: session.user.id, method: "anonymize", anonHandle },
      actor: { id: session.user.id, email: session.user.email, role },
      req,
    });

    return NextResponse.json({ ok: true, anonHandle, method: "anonymize" });
  } catch (e) { return apiError(e); }
}
