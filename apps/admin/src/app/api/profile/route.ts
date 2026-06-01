// Self-update endpoint used by /profile/<section> edit pages.
//
// Any authenticated user (ADMIN / EDITOR / SUB_EDITOR / USER) can PUT their
// own User row. Only the editorial / E-E-A-T fields are accepted - email,
// password, role, active, mustChangePassword, and admin-managed relations
// are intentionally NOT in the schema below so a malicious client cannot
// escalate by tampering with the JSON body.
//
// REPORTER role is bounced to the existing /api/reporter/profile flow which
// also rewrites the ReporterProfile row.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { z } from "zod";

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), {
    message: "Must be a full URL starting with http:// or https://",
  })
  .nullable()
  .optional();

const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    bio: z.string().trim().max(2000).nullable().optional(),
    phone: z.string().trim().max(20).nullable().optional(),
    yearsExperience: z
      .number()
      .int()
      .min(0)
      .max(80)
      .nullable()
      .optional(),
    expertise: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
    affiliations: z
      .array(z.string().trim().min(1).max(120))
      .max(40)
      .optional(),
    twitterHandle: z
      .string()
      .trim()
      .max(40)
      .transform((v) => v.replace(/^@/, ""))
      .nullable()
      .optional(),
    linkedinUrl: optionalUrl,
    facebookUrl: optionalUrl,
    // Self-assignable category list - the existing UserCategory join table
    // is rewritten transactionally below. ADMIN-only API stays the source
    // of truth for who can assign whom; this endpoint trusts the caller to
    // pick their own categories.
    //
    // The cap is a request-size guard against pathological bodies, not a
    // business rule. Keep it well above any realistic total category count
    // so it never bites a real user (admin or senior editor owning every
    // category, for example).
    assignedCategoryIds: z.array(z.string().min(1)).max(5000).optional(),
  })
  .strict();

export async function PUT(req: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (role === "REPORTER") {
    return NextResponse.json(
      { error: "Reporters update profile via /api/reporter/profile" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { assignedCategoryIds, ...rest } = parsed.data;

  // Empty-string normalisation: forms post "" for cleared fields. Convert
  // to null on the User row so optional columns stay tidy.
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    data[k] = v === "" ? null : v;
  }

  // Categories rewrite must be transactional with the user update so we
  // never end up with the user saved but the join table half-rebuilt.
  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.user.update({ where: { id: userId }, data });
    }
    if (assignedCategoryIds) {
      // Validate the IDs exist - silently drop unknowns rather than 400 so
      // a stale client doesn't fail the whole save over one deleted row.
      const valid = await tx.category.findMany({
        where: { id: { in: assignedCategoryIds } },
        select: { id: true },
      });
      const validIds = new Set(valid.map((c) => c.id));

      await tx.userCategory.deleteMany({ where: { userId } });
      if (validIds.size > 0) {
        await tx.userCategory.createMany({
          data: Array.from(validIds).map((categoryId) => ({
            userId,
            categoryId,
          })),
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
