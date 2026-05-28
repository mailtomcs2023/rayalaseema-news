import { NextRequest, NextResponse } from "next/server";
import { prisma, deskCreateSchema } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { cachedJson } from "@/lib/http-cache";

// GET /api/desks[?branch=…&limit=500] - list all desks (auth required, used
// by article editor + Desks CRUD page).
// Limit caps the result at 500 by default (max 1000) so a runaway insert
// can never flood the article editor with thousands of desks. Shape stays
// a bare array - consumers across the app rely on the array shape.
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const branch = searchParams.get("branch"); // optional filter
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "500"), 1),
      1000,
    );
    const desks = await prisma.desk.findMany({
      where: branch ? { branch: branch as any } : undefined,
      include: { _count: { select: { contents: true } } },
      orderBy: [{ branch: "asc" }, { sortOrder: "asc" }, { nameEn: "asc" }],
      take: limit,
    });
    return cachedJson(req, desks, { maxAge: 5, staleWhileRevalidate: 60 });
  } catch (e) {
    return apiError(e);
  }
}

// POST /api/desks - create a new desk (admins only; geographic/topical desks are auto-seeded,
// this is mainly for adding EDITORIAL desks or one-off bureaus).
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const rawBody = await req.json();
    const parsed = deskCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const { name, nameEn, slug, branch, parentId, categoryId, districtId, constituencyId, sortOrder, active } = parsed.data;

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
