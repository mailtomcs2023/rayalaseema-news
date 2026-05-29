import { NextRequest, NextResponse } from "next/server";
import { prisma, userUpdateSchema } from "@rayalaseema/db";
import { hash } from "bcryptjs";
import { requireAuth, isAuthError, apiError, zodErrorResponse } from "@/lib/api-utils";
import { redistributeReviewerArticles } from "@/lib/reviewer-assignment";
import { normalizeEmail } from "@/lib/email";
import { isProtectedUser } from "@/lib/protected-users";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const rawBody = await req.json();
    const parsed = userUpdateSchema.safeParse(rawBody);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    const b = parsed.data;
    const data: any = {};
    for (const key of ["name", "role", "active", "bio", "phone"] as const) {
      if (b[key] !== undefined) data[key] = b[key];
    }
    // Email = identity. Rules:
    //   - Only an ADMIN role can change another user's email (this PUT is
    //     already ADMIN-gated above).
    //   - An admin cannot change THEIR OWN email - another admin must do
    //     it. Guards against typos that lock the admin out + a compromised
    //     admin session re-keying their own account.
    //   - Editor / Sub-Editor / Reporter editing themselves through OTHER
    //     routes never reach this allow-list.
    if (b.email !== undefined) {
      const sessionUserId = (session.user as any)?.id as string | undefined;
      if (sessionUserId === id) {
        return NextResponse.json(
          { error: "An admin cannot change their own email. Ask another admin to do it." },
          { status: 403 },
        );
      }
      const cleanEmail = normalizeEmail(b.email);
      if (!cleanEmail) return NextResponse.json({ error: "Email cannot be empty" }, { status: 400 });
      data.email = cleanEmail;
    }
    if (b.password) data.passwordHash = await hash(b.password, 12);
    // Force-change-on-first-login flag - admin can toggle this independently
    // of password change (e.g. to force a future rotation on a user who hasn't
    // been touched in months).
    if (b.mustChangePassword !== undefined) data.mustChangePassword = !!b.mustChangePassword;

    // Detect "this user is being deactivated" - we need to redistribute any
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

    // Atomic write: user.update + category-assignment replace all happen in
    // one transaction so a mid-loop FK failure can't leave the user with
    // half-replaced assignments. Inserts use createMany + skipDuplicates
    // (instead of the old per-row create loop) - one round trip instead of N.
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data });
      if (b.categoryIds !== undefined) {
        await tx.userCategory.deleteMany({ where: { userId: id } });
        if (b.categoryIds?.length) {
          await tx.userCategory.createMany({
            data: (b.categoryIds as string[]).map((catId) => ({ userId: id, categoryId: catId })),
            skipDuplicates: true,
          });
        }
      }
      return updated;
    });

    // Redistribute any SUBMITTED/IN_REVIEW articles this sub-editor had
    // assigned so they don't get stranded. Best-effort - admin sees a count
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

// Hard delete - permanently removes the User row from the DB. To soft-delete
// (set `active: false` so the user can no longer sign in but their authored
// content is preserved) call PUT with `{ active: false }` instead - that's
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
        email: true,
        _count: { select: { contents: true } },
      },
    });
    if (!prior) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Protected seed accounts (admin / editor / sub-editor / reporter from
    // prisma/seed.ts) can never be deleted - the deploy script re-upserts
    // them, so a delete would just put the row in a confusing temporary
    // state. Deactivate instead if the canonical account needs to be
    // disabled.
    if (isProtectedUser(prior.email)) {
      return NextResponse.json(
        {
          error: "This is a built-in seed account and cannot be deleted. Deactivate it instead if you need to disable sign-in.",
        },
        { status: 403 },
      );
    }

    // Block hard-delete when the user owns content - Content.authorId is
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
    // disappear from the pool - same logic the PUT/deactivate path uses.
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
