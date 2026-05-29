import { NextRequest, NextResponse } from "next/server";
import { prisma, userCreateSchema } from "@rayalaseema/db";
import { hash } from "bcryptjs";
import { requireCan, isAuthError, apiError, zodErrorResponse } from "@/lib/api-utils";
import { normalizeEmail } from "@/lib/email";

// GET /api/users[?role=…&cursor=…&limit=…&page=…&includeTotal=1]
//
// Returns every user across all roles. The optional ?role filter scopes
// the result set; the page filters client-side via the role chip row but
// the param exists for future server-side filtering.
//
// Pagination - two modes:
//   1. CURSOR (preferred, constant-time) - pass `?cursor=<id>&limit=50`.
//      Returns `nextCursor` (or null when done) and `hasMore`. Forward-only.
//      `total` only when `?includeTotal=1` (counting is the slow part).
//   2. OFFSET (legacy fallback) - pass `?page=2&limit=50`. Returns `total`,
//      `page`, `limit`. Cost grows with page number.
//
// Default response shape (no pagination params): `{ items, hasMore,
// nextCursor, total, limit }` with limit=500 - high enough to hold the
// entire current user table while the /users UI still paginates
// client-side via TanStack. Real cursor consumption happens in PR 12 when
// the UI switches to TanStack Query manual pagination.
//
// REPORTER rows are returned alongside everyone else with their
// ReporterProfile (KYC status, district, banking, etc.) plus a
// pending-profile-updates count nested under the profile so the merged
// /users table can render reporter-specific columns (KYC Status, Updates,
// Phone, District) without a second round-trip.
export async function GET(req: NextRequest) {
  const session = await requireCan("user.manage");
  if (isAuthError(session)) return session;
  try {
    const url = new URL(req.url);
    const roleParam = url.searchParams.get("role");
    const cursor = url.searchParams.get("cursor") || "";
    const page = parseInt(url.searchParams.get("page") || "1");
    // Default limit 500 keeps the legacy "fetch all and paginate in TanStack"
    // behaviour working while the UI is still on that flow. Max 500 caps
    // any future surprise full-table loads.
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "500"), 1), 500);
    const includeTotal = url.searchParams.get("includeTotal") === "1" || !cursor;
    const VALID_ROLES = ["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER", "USER"] as const;
    const where = roleParam && VALID_ROLES.includes(roleParam as any)
      ? { role: roleParam as any }
      : {};

    // Newest-first ordering - admins want recently-created accounts at
    // the top of the list. id tiebreaker (also desc) keeps two rows
    // with the same timestamp from shuffling between cursor pages.
    const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
    const select = {
      id: true, email: true, name: true, role: true, active: true, phone: true,
      createdAt: true, mustChangePassword: true,
      _count: { select: { contents: true } },
      assignedCategories: { include: { category: { select: { id: true, name: true, nameEn: true } } } },
      reporterProfile: {
        select: {
          id: true,
          primaryDistrict: true,
          kycStatus: true,
          kycRejectionNote: true,
          verifiedAt: true,
          _count: {
            select: { profileUpdateRequests: { where: { status: "PENDING" as const } } },
          },
        },
      },
    } as const;

    // Cursor mode - fetch +1 to detect hasMore cheaply.
    if (cursor) {
      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where, select, orderBy,
          take: limit + 1,
          cursor: { id: cursor },
          skip: 1,
        }),
        includeTotal ? prisma.user.count({ where }) : Promise.resolve(null),
      ]);
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;
      return NextResponse.json({ items, hasMore, nextCursor, total, limit });
    }

    // Offset / default mode.
    const offset = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where, select, orderBy,
        take: limit + 1,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;
    return NextResponse.json({ items, hasMore, nextCursor, total, page, limit });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireCan("user.manage");
  if (isAuthError(session)) return session;
  try {
    const rawBody = await req.json();
    // Boundary validation - shape, length, enum membership all checked here.
    const parsed = userCreateSchema.safeParse(rawBody);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    const b = parsed.data;
    const role = (b.role || "REPORTER") as string;

    // Canonicalise email - see lib/email.ts. Stops case-only duplicates
    // (Foo@x.com / foo@x.com) and trailing-whitespace duplicates.
    const cleanEmail = normalizeEmail(b.email);
    if (!cleanEmail) return NextResponse.json({ error: "Email required" }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) return NextResponse.json({ error: "Email already exists" }, { status: 400 });

    const passwordHash = await hash(b.password, 12);

    // Wrap User + category assignments + ReporterProfile in a single
    // transaction so partial failures don't leave orphan rows:
    //   - User created, profile create fails → orphan User
    //   - User created, categories partly assigned → inconsistent rights
    // $transaction rolls all of them back as one unit on any failure.
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: cleanEmail, name: b.name, passwordHash,
          role: role as any, bio: b.bio, phone: b.phone,
          // Force-change-on-first-login flag: admin-set when creating an
          // account with a temporary password the user should rotate.
          mustChangePassword: !!b.mustChangePassword,
        },
      });

      // Assign categories if SUB_EDITOR / EDITOR. createMany skips
      // duplicates atomically - no per-row .catch swallowing required.
      if (b.categoryIds?.length && (b.role === "SUB_EDITOR" || b.role === "EDITOR")) {
        await tx.userCategory.createMany({
          data: (b.categoryIds as string[]).map((catId) => ({ userId: created.id, categoryId: catId })),
          skipDuplicates: true,
        });
      }

      // Auto-create a stub staff profile for every editorial role
      // (REPORTER, SUB_EDITOR, EDITOR, ADMIN). The schema model is still
      // ReporterProfile - renamed conceptually but the table is shared
      // by all paid staff because every salaried account needs KYC,
      // banking and Aadhaar for compliance + payouts. ADMIN gets one too
      // so admins can self-test the flow without special-casing the seed.
      // USER role is the only one without a profile - public commenters
      // aren't on the payroll.
      if (["REPORTER", "SUB_EDITOR", "EDITOR", "ADMIN"].includes(role)) {
        await tx.reporterProfile.create({
          data: { userId: created.id, fullName: b.name as string },
        });
      }

      return created;
    });

    return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
