import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { hash } from "bcryptjs";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { redistributeReviewerArticles } from "@/lib/reviewer-assignment";
import { normalizeEmail } from "@/lib/email";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const b = await req.json();
    const data: any = {};
    for (const key of ["name", "role", "active", "bio", "phone"] as const) {
      if (b[key] !== undefined) data[key] = b[key];
    }
    // Canonicalise email on edit too — admins occasionally fix typos in
    // existing rows, and we don't want a stray uppercase letter to slip a
    // duplicate past the unique constraint.
    if (b.email !== undefined) {
      const cleanEmail = normalizeEmail(b.email);
      if (!cleanEmail) return NextResponse.json({ error: "Email cannot be empty" }, { status: 400 });
      data.email = cleanEmail;
    }
    if (b.password) data.passwordHash = await hash(b.password, 12);
    // Force-change-on-first-login flag — admin can toggle this independently
    // of password change (e.g. to force a future rotation on a user who hasn't
    // been touched in months).
    if (b.mustChangePassword !== undefined) data.mustChangePassword = !!b.mustChangePassword;

    // Detect "this user is being deactivated" — we need to redistribute any
    // articles they had assigned before they vanish from the review pool.
    // We read the prior state first so we know whether `active` actually
    // changed (vs being a no-op write).
    const prior = await prisma.user.findUnique({
      where: { id },
      select: { active: true, role: true },
    });
    const willDeactivate =
      prior?.role === "SUB_EDITOR" &&
      prior.active === true &&
      data.active === false;

    const user = await prisma.user.update({ where: { id }, data });

    // Update category assignments
    if (b.categoryIds !== undefined) {
      // Remove old assignments
      await prisma.userCategory.deleteMany({ where: { userId: id } });
      // Add new
      if (b.categoryIds?.length) {
        for (const catId of b.categoryIds) {
          await prisma.userCategory.create({ data: { userId: id, categoryId: catId } }).catch(() => {});
        }
      }
    }

    // Redistribute any SUBMITTED/IN_REVIEW articles this sub-editor had
    // assigned so they don't get stranded. Best-effort — admin sees a count
    // in the response so they know it ran.
    let redistribution: { reassigned: number; unassigned: number } | undefined;
    if (willDeactivate) {
      redistribution = await redistributeReviewerArticles(prisma, id);
    }

    return NextResponse.json({ ...user, redistribution });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const prior = await prisma.user.findUnique({
      where: { id },
      select: { active: true, role: true },
    });
    await prisma.user.update({ where: { id }, data: { active: false } });
    // Same redistribution path as PUT when a SUB_EDITOR is deactivated via DELETE.
    let redistribution: { reassigned: number; unassigned: number } | undefined;
    if (prior?.role === "SUB_EDITOR" && prior.active) {
      redistribution = await redistributeReviewerArticles(prisma, id);
    }
    return NextResponse.json({ success: true, redistribution });
  } catch (error) {
    return apiError(error);
  }
}
