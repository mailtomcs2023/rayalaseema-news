import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/epaper/article-picker?categorySlug=&districtSlug=&hasImage=&q=
//
// Returns published articles from the last 7 days filtered for the editor's
// slot-replacement dropdown. Newest first; cap 60.
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const categorySlug = searchParams.get("categorySlug");
    const districtSlug = searchParams.get("districtSlug");
    const hasImage = searchParams.get("hasImage") === "1";
    const q = (searchParams.get("q") || "").trim();

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const where: Record<string, unknown> = {
      status: "PUBLISHED",
      publishedAt: { gte: since },
    };
    if (categorySlug) (where as any).category = { slug: categorySlug };
    if (districtSlug) (where as any).constituency = { district: { slug: districtSlug } };
    if (hasImage) (where as any).featuredImage = { not: null };
    if (q) (where as any).title = { contains: q, mode: "insensitive" };

    const articles = await prisma.article.findMany({
      where: where as any,
      select: {
        id: true, slug: true, title: true, featuredImage: true, publishedAt: true,
        category: { select: { name: true, slug: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 60,
    });

    return NextResponse.json({ articles });
  } catch (e) {
    return apiError(e);
  }
}
