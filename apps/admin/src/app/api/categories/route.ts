import { NextRequest, NextResponse } from "next/server";
import { prisma, categoryCreateSchema } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { cachedJson } from "@/lib/http-cache";

// GET /api/categories[?limit=200]
//
// Returns up to `limit` categories (default 500, max 1000) ordered by
// sortOrder. Shape stays a bare array for backward compat - 4 consumers
// across the app rely on the array shape, so we add a safety cap without
// changing the response. If the table ever exceeds the cap, the caller
// silently sees a truncated list; that's the point at which we'd flip
// this to cursor mode and migrate consumers.
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const limit = Math.min(
      Math.max(parseInt(new URL(req.url).searchParams.get("limit") || "500"), 1),
      1000,
    );
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { contents: true } } },
      take: limit,
    });
    // Cache 5s fresh + 60s SWR - categories table changes maybe once a
    // week, so editors get instant repeat-load and one straggler request
    // refreshes for everyone behind a CDN.
    return cachedJson(req, categories, { maxAge: 5, staleWhileRevalidate: 60 });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const rawBody = await req.json();
    const parsed = categoryCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const count = await prisma.category.count();
    const slug = body.slug || body.nameEn?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || `cat-${Date.now()}`;
    const cat = await prisma.category.create({
      data: { name: body.name, nameEn: body.nameEn, slug, color: body.color || "#FF2C2C", description: body.description, sortOrder: body.sortOrder || count + 1, active: body.active ?? true, parentId: body.parentId || null },
    });

    // New categories start with an empty tag-suggestion pool. As editors
    // tag articles under this category, those tags get surfaced via the
    // usage-learning path in /api/categories/[id]/suggested-tags. To seed
    // a brand-new category up-front, add it to scripts/seed-category-tags.ts.

    return NextResponse.json(cat, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
