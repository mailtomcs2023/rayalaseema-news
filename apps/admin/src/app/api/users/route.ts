import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { hash } from "bcryptjs";
import { requireCan, isAuthError, apiError } from "@/lib/api-utils";
import { normalizeEmail } from "@/lib/email";

// GET /api/users[?role=ADMIN|EDITOR|SUB_EDITOR|REPORTER|USER]
//
// Returns every user across all roles. The optional ?role filter scopes
// the result set; the page filters client-side via the role chip row but
// the param exists for future server-side filtering.
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
    const VALID_ROLES = ["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER", "USER"] as const;
    const where = roleParam && VALID_ROLES.includes(roleParam as any)
      ? { role: roleParam as any }
      : {};

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, role: true, active: true, phone: true,
        createdAt: true, mustChangePassword: true,
        _count: { select: { contents: true } },
        assignedCategories: { include: { category: { select: { id: true, name: true, nameEn: true } } } },
        // Reporter-specific fields. null for non-REPORTER rows (no profile
        // exists). The pending-updates count nests inside so the UI can
        // render the "Review" badge from the reporter's perspective.
        reporterProfile: {
          select: {
            id: true,
            primaryDistrict: true,
            kycStatus: true,
            kycRejectionNote: true,
            verifiedAt: true,
            _count: {
              select: { profileUpdateRequests: { where: { status: "PENDING" } } },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(users);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireCan("user.manage");
  if (isAuthError(session)) return session;
  try {
    const b = await req.json();
    if (!b.email || !b.password || !b.name) return NextResponse.json({ error: "Name, email, password required" }, { status: 400 });

    // Validate role against the Prisma enum upfront so a bad value returns
    // a readable 400 instead of bubbling up as an opaque 500 from Prisma.
    const VALID_ROLES = ["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER", "USER"] as const;
    const role = (b.role || "REPORTER") as string;
    if (!VALID_ROLES.includes(role as any)) {
      return NextResponse.json({ error: `Invalid role '${role}'. Must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
    }

    // Canonicalise email — see lib/email.ts. Stops case-only duplicates
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
      // duplicates atomically — no per-row .catch swallowing required.
      if (b.categoryIds?.length && (b.role === "SUB_EDITOR" || b.role === "EDITOR")) {
        await tx.userCategory.createMany({
          data: (b.categoryIds as string[]).map((catId) => ({ userId: created.id, categoryId: catId })),
          skipDuplicates: true,
        });
      }

      // Auto-create a stub ReporterProfile for new REPORTER accounts so
      // downstream KYC actions (verify, reject, profile-update-requests)
      // have a row to operate on. The full KYC fields get filled in via
      // the reporter editor or by the reporter on the mobile portal.
      if (role === "REPORTER") {
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
