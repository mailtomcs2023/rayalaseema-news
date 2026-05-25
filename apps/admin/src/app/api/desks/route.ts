import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/desks — list all desks (auth required, used by article editor + Desks CRUD page).
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const branch = searchParams.get("branch"); // optional filter
    const desks = await prisma.desk.findMany({
      where: branch ? { branch: branch as any } : undefined,
      include: { _count: { select: { articles: true } } },
      orderBy: [{ branch: "asc" }, { sortOrder: "asc" }, { nameEn: "asc" }],
    });
    return NextResponse.json(desks);
  } catch (e) {
    return apiError(e);
  }
}

// POST /api/desks — create a new desk (admins only; geographic/topical desks are auto-seeded,
// this is mainly for adding EDITORIAL desks or one-off bureaus).
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const { name, nameEn, slug, branch, parentId, categoryId, districtId, constituencyId, sortOrder, active } = body;

    if (!name || !nameEn || !slug || !branch) {
      return NextResponse.json({ error: "name, nameEn, slug, branch are required" }, { status: 400 });
    }
    if (!["TOPICAL", "GEOGRAPHIC", "EDITORIAL"].includes(branch)) {
      return NextResponse.json({ error: "branch must be TOPICAL | GEOGRAPHIC | EDITORIAL" }, { status: 400 });
    }

    const desk = await prisma.desk.create({
      data: {
        name: String(name).trim(),
        nameEn: String(nameEn).trim(),
        slug: String(slug).trim(),
        branch,
        parentId: parentId || null,
        categoryId: categoryId || null,
        districtId: districtId || null,
        constituencyId: constituencyId || null,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        active: active !== false,
      },
    });
    return NextResponse.json(desk, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
