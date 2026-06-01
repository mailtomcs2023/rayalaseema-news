// Self-serve password change for any signed-in admin-app user. Used by:
//   - /change-password page (forced when User.mustChangePassword is true)
//   - "Change password" link in user profile / settings (future)
//
// Verifies the current password before applying the new one - without
// the current-password check, an attacker who steals an active session
// could lock out the legitimate owner. The check stays even when
// mustChangePassword=true because the user can prove ownership with
// the temp password the admin just shared (same secret they used to
// sign in).
//
// On success: hashes new password, clears mustChangePassword, audit-logs
// the change. Never logs or returns the password itself.

import { NextRequest, NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(200, "New password is too long")
    .refine((v) => /[a-z]/.test(v), "Must include at least one lowercase letter")
    .refine((v) => /[A-Z]/.test(v), "Must include at least one uppercase letter")
    .refine((v) => /\d/.test(v), "Must include at least one digit"),
});

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { currentPassword, newPassword } = parsed.data;

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from your current password", fieldErrors: { newPassword: ["Must differ from current password"] } },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true },
    });
    if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const ok = await compare(currentPassword, user.passwordHash);
    if (!ok) {
      // Audit failed attempts so brute-force noise shows up in the log.
      await logAudit({
        action: "auth.password.change.failed",
        resource: "user",
        resourceId: user.id,
        actor: session.user,
        req,
      });
      return NextResponse.json(
        { error: "Current password is incorrect", fieldErrors: { currentPassword: ["Incorrect password"] } },
        { status: 403 },
      );
    }

    const newHash = await hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, mustChangePassword: false },
    });
    await logAudit({
      action: "auth.password.change",
      resource: "user",
      resourceId: user.id,
      meta: { reason: "self-serve" },
      actor: session.user,
      req,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError(e);
  }
}
