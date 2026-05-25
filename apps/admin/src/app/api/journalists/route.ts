import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { hash } from "bcryptjs";
import { randomInt } from "crypto";

// Test/QA reporter account(s) — editable, but never deletable via the portal.
const PROTECTED_EMAILS = ["reporter@rayalaseemaexpress.com"];

// A readable temp password for admin-assisted resets — no ambiguous
// chars (0/O/1/l/I) so it can be relayed over a phone call without confusion.
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 10; i++) pw += chars[randomInt(chars.length)];
  return pw;
}

// Build the JournalistProfile field set from an admin create/edit form payload.
// kycStatus is only included when explicitly provided (edit leaves it untouched).
function profileData(d: Record<string, unknown>) {
  const langs = d.languages;
  return {
    fullName: (d.fullName as string) || (d.name as string) || "",
    fatherName: (d.fatherName as string) || null,
    dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth as string) : null,
    gender: (d.gender as string) || null,
    address: (d.address as string) || null,
    city: (d.city as string) || null,
    pincode: (d.pincode as string) || null,
    primaryDistrict: (d.primaryDistrict as string) || null,
    aadhaarNumber: (d.aadhaarNumber as string) || null,
    panNumber: (d.panNumber as string) || null,
    upiId: (d.upiId as string) || null,
    bankName: (d.bankName as string) || null,
    bankAccount: (d.bankAccount as string) || null,
    bankIfsc: (d.bankIfsc as string) || null,
    bankBranch: (d.bankBranch as string) || null,
    experience: (d.experience as string) || null,
    specialization: (d.specialization as string) || null,
    languages: Array.isArray(langs)
      ? (langs as string[])
      : langs
        ? String(langs)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    ...(d.kycStatus ? { kycStatus: d.kycStatus as "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED" } : {}),
  };
}

// GET all journalists with profiles
export async function GET() {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const journalists = await prisma.user.findMany({
      where: { role: "REPORTER" },
      include: {
        // Include the pending change-request count alongside the profile so
        // the journalists table can surface "this reporter has N updates
        // awaiting your review" without a second round-trip per row.
        journalistProfile: {
          include: {
            _count: {
              select: { profileUpdateRequests: { where: { status: "PENDING" } } },
            },
          },
        },
        _count: { select: { contents: true, contentPayments: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(journalists);
  } catch (error) {
    return apiError(error);
  }
}

// POST - create / update a journalist, approve/reject KYC, or reset a password
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const action = body.action as string;
    if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

    // ---- create a new journalist (User + JournalistProfile) ----
    if (action === "create") {
      const d = (body.data || {}) as Record<string, unknown>;
      if (!d.name || !d.email || !d.password) {
        return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 });
      }
      const exists = await prisma.user.findUnique({ where: { email: d.email as string } });
      if (exists) return NextResponse.json({ error: "Email already registered" }, { status: 400 });

      const user = await prisma.user.create({
        data: {
          email: d.email as string,
          name: d.name as string,
          phone: (d.phone as string) || null,
          passwordHash: await hash(d.password as string, 12),
          role: "REPORTER",
          active: d.active === undefined ? true : Boolean(d.active),
        },
      });
      await prisma.journalistProfile.create({ data: { userId: user.id, ...profileData(d) } });
      return NextResponse.json({ success: true, userId: user.id }, { status: 201 });
    }

    // ---- update an existing journalist ----
    if (action === "update") {
      const userId = body.userId as string;
      const d = (body.data || {}) as Record<string, unknown>;
      if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
      if (!d.name || !d.email) {
        return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
      }
      const dup = await prisma.user.findFirst({
        where: { email: d.email as string, NOT: { id: userId } },
      });
      if (dup) return NextResponse.json({ error: "Email already in use by another account" }, { status: 400 });

      await prisma.user.update({
        where: { id: userId },
        data: {
          name: d.name as string,
          email: d.email as string,
          phone: (d.phone as string) || null,
          active: d.active === undefined ? true : Boolean(d.active),
        },
      });
      await prisma.journalistProfile.upsert({
        where: { userId },
        update: profileData(d),
        create: { userId, ...profileData(d) },
      });
      return NextResponse.json({ success: true });
    }

    // ---- deactivate one or more journalists (soft-delete) ----
    // We flip `active: false` instead of hard-deleting. That keeps every
    // article / payment / KYC document intact, leaves an obvious "Inactive"
    // marker in the journalists list, and is one click away from
    // reactivation (Edit details → tick Active, or Reset password —
    // resetting their password automatically flips active back to true).
    if (action === "delete") {
      const userIds = body.userIds as string[];
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return NextResponse.json({ error: "userIds required" }, { status: 400 });
      }
      const users = await prisma.user.findMany({
        where: { id: { in: userIds }, role: "REPORTER" },
        select: { id: true, name: true, email: true },
      });
      const deactivatable: string[] = [];
      const skipped: { name: string; reason: string }[] = [];
      for (const u of users) {
        if (PROTECTED_EMAILS.includes(u.email.toLowerCase())) {
          skipped.push({ name: u.name, reason: "protected test account" });
          continue;
        }
        deactivatable.push(u.id);
      }
      if (deactivatable.length) {
        await prisma.user.updateMany({
          where: { id: { in: deactivatable } },
          data: { active: false },
        });
      }
      // `deleted` retained in the response shape for any older client; the
      // value is the same idea (how many rows we acted on).
      return NextResponse.json({
        success: true,
        deactivated: deactivatable.length,
        deleted: deactivatable.length,
        skipped,
      });
    }

    // ---- reactivate one or more journalists (undo a soft-delete) ----
    // Inverse of action:"delete". No content checks needed — flipping
    // `active: true` lets them sign in again; nothing was destroyed.
    if (action === "activate") {
      const userIds = body.userIds as string[];
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return NextResponse.json({ error: "userIds required" }, { status: 400 });
      }
      const result = await prisma.user.updateMany({
        where: { id: { in: userIds }, role: "REPORTER" },
        data: { active: true },
      });
      return NextResponse.json({ success: true, activated: result.count });
    }

    // ---- KYC + password actions (operate on a JournalistProfile) ----
    const { profileId, note } = body as { profileId?: string; note?: string };
    if (!profileId) return NextResponse.json({ error: "profileId required" }, { status: 400 });

    if (action === "verify") {
      await prisma.journalistProfile.update({
        where: { id: profileId },
        data: { kycStatus: "VERIFIED", verifiedAt: new Date() },
      });
    } else if (action === "reject") {
      // Rejection reason is mandatory — the reporter sees this text in the
      // app's KYC banner and uses it to fix their re-submission. Without it
      // the rejection is unactionable, so the admin UI also blocks empty
      // submissions; this is defense in depth for any non-UI caller.
      const trimmedNote = typeof note === "string" ? note.trim() : "";
      if (!trimmedNote) {
        return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 });
      }
      await prisma.journalistProfile.update({
        where: { id: profileId },
        data: { kycStatus: "REJECTED", kycRejectionNote: trimmedNote },
      });
    } else if (action === "reset-password") {
      // Two knobs the admin modal can send in addition to `profileId`:
      //   customPassword — admin typed a specific value; we use it as-is.
      //                    Falls back to a random temp password when absent
      //                    or shorter than 8 chars.
      //   oneTime        — true means "force them to change it at next
      //                    sign-in" (User.mustChangePassword flag).
      const customPassword =
        typeof (body as { customPassword?: unknown }).customPassword === "string"
          ? ((body as { customPassword: string }).customPassword).trim()
          : "";
      const oneTime = (body as { oneTime?: unknown }).oneTime === true;

      if (customPassword && customPassword.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 },
        );
      }

      const profile = await prisma.journalistProfile.findUnique({
        where: { id: profileId },
        select: { userId: true },
      });
      if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

      const password = customPassword || generateTempPassword();
      await prisma.user.update({
        where: { id: profile.userId },
        data: {
          passwordHash: await hash(password, 12),
          mustChangePassword: oneTime,
          // If the admin is bothering to set a new password they want this
          // account usable — flip it back to active in case it was soft-
          // deleted earlier (the "Deactivate journalist" menu item only
          // sets active:false, it doesn't actually delete the row).
          active: true,
        },
      });
      // `tempPassword` kept for backward-compat with any older caller; the
      // new modal reads `password` (plus the oneTime echo so it can show the
      // right confirmation banner).
      return NextResponse.json({ success: true, password, tempPassword: password, oneTime });
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
