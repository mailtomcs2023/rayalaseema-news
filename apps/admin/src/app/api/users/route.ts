import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { hash } from "bcryptjs";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, name: true, role: true, active: true, phone: true,
        createdAt: true,
        _count: { select: { articles: true } },
        assignedCategories: { include: { category: { select: { id: true, name: true, nameEn: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(users);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const b = await req.json();
    if (!b.email || !b.password || !b.name) return NextResponse.json({ error: "Name, email, password required" }, { status: 400 });

    // Validate role against the Prisma enum upfront so a bad value returns
    // a readable 400 instead of bubbling up as an opaque 500 from Prisma.
    const VALID_ROLES = ["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR", "REPORTER"] as const;
    const role = (b.role || "REPORTER") as string;
    if (!VALID_ROLES.includes(role as any)) {
      return NextResponse.json({ error: `Invalid role '${role}'. Must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: b.email } });
    if (existing) return NextResponse.json({ error: "Email already exists" }, { status: 400 });

    const passwordHash = await hash(b.password, 12);
    const user = await prisma.user.create({
      data: {
        email: b.email, name: b.name, passwordHash,
        role: role as any, bio: b.bio, phone: b.phone,
      },
    });

    // Assign categories if SUB_EDITOR
    if (b.categoryIds?.length && (b.role === "SUB_EDITOR" || b.role === "EDITOR")) {
      for (const catId of b.categoryIds) {
        await prisma.userCategory.create({ data: { userId: user.id, categoryId: catId } }).catch(() => {});
      }
    }

    return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
