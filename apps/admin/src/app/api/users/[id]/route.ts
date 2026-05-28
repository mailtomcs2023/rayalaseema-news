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

// Hard delete — permanently removes the User row from the DB. To soft-delete
// (set `active: false` so the user can no longer sign in but their authored
// content is preserved) call PUT with `{ active: false }` instead — that's
// what the "Deactivate" action in the UI does.
//
// Refuses if the user has authored Content rows (FK constraint would fail
// anyway since Content.authorId is NOT NULL). Sub-editors with open reviews
// get their backlog redistributed before delete so articles aren't orphaned.
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const prior = await prisma.user.findUnique({
      where: { id },
      select: {
        active: true,
        role: true,
        _count: { select: { contents: true } },
      },
    });
    if (!prior) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Block hard-delete when the user owns content — Content.authorId is
    // NOT NULL so the DELETE would FK-fail. Admin should Deactivate instead,
    // which keeps the authorship trail intact.
    if (prior._count.contents > 0) {
      return NextResponse.json(
        {
          error: `User has ${prior._count.contents} authored article${prior._count.contents === 1 ? "" : "s"} and cannot be deleted. Deactivate them instead.`,
        },
        { status: 409 },
      );
    }

    // Redistribute any open reviews this sub-editor was holding before they
    // disappear from the pool — same logic the PUT/deactivate path uses.
    let redistribution: { reassigned: number; unassigned: number } | undefined;
    if (prior.role === "SUB_EDITOR" && prior.active) {
      redistribution = await redistributeReviewerArticles(prisma, id);
    }

    try {
      await prisma.user.delete({ where: { id } });
    } catch (e: any) {
      // Catch any other FK constraint we didn't pre-check (audit log relations,
      // payments, template authorship, etc.) so the admin sees a clear message
      // instead of a 500.
      if (e?.code === "P2003") {
        return NextResponse.json(
          {
            error: "User has related records (payments, audit log, or templates) and cannot be deleted. Deactivate them instead.",
          },
          { status: 409 },
        );
      }
      throw e;
    }

    return NextResponse.json({ success: true, redistribution });
  } catch (error) {
    return apiError(error);
  }
}
