import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/epaper/article-picker
//   ?categorySlug=&districtSlug=&hasImage=1&minWords=150&breaking=1&featured=1
//   &q=&windowDays=7&sort=newest|views|breaking|featured&limit=100
//
// Every filter is OPTIONAL. The editor passes the slot's defaults but lets the
// operator untick chips to widen — the API just honors whatever it gets.
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const sp = req.nextUrl.searchParams;

    const categorySlug = sp.get("categorySlug") || "";
    const districtSlug = sp.get("districtSlug") || "";
    const hasImage = sp.get("hasImage") === "1";
    const minWords = parseInt(sp.get("minWords") || "0", 10) || 0;
    const breaking = sp.get("breaking") === "1";
    const featured = sp.get("featured") === "1";
    const q = (sp.get("q") || "").trim();
    const windowDays = Math.max(1, Math.min(365, parseInt(sp.get("windowDays") || "7", 10) || 7));
    const sort = (sp.get("sort") || "newest") as "newest" | "views" | "breaking" | "featured";
    const limit = Math.max(10, Math.min(500, parseInt(sp.get("limit") || "100", 10) || 100));

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const where: Record<string, unknown> = {
      status: "PUBLISHED",
      publishedAt: { gte: since },
    };
    if (categorySlug) (where as any).category = { slug: categorySlug };
    if (districtSlug) (where as any).constituency = { district: { slug: districtSlug } };
    if (hasImage) (where as any).featuredImage = { not: null };
    if (breaking) (where as any).breaking = true;
    if (featured) (where as any).featured = true;
    if (q) (where as any).title = { contains: q, mode: "insensitive" };

    const orderBy =
      sort === "views" ? { viewCount: "desc" as const }
      : sort === "breaking" ? [{ breaking: "desc" as const }, { publishedAt: "desc" as const }]
      : sort === "featured" ? [{ featured: "desc" as const }, { publishedAt: "desc" as const }]
      : { publishedAt: "desc" as const };

    // Fetch a larger pool when minWords > 0 — body-length filter runs in app code
    // (no efficient SQL for `LENGTH(strip_html(body))`).
    const rows = await prisma.article.findMany({
      where: where as any,
      select: {
        id: true, slug: true, title: true, featuredImage: true, publishedAt: true,
        breaking: true, featured: true, viewCount: true,
        ...(minWords > 0 ? { body: true } : {}),
        category: { select: { name: true, slug: true } },
      },
      orderBy: orderBy as any,
      take: minWords > 0 ? limit * 3 : limit,
    });

    const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const filtered = minWords > 0
      ? rows.filter((r: any) => stripHtml(r.body || "").split(/\s+/).filter(Boolean).length >= minWords).slice(0, limit)
      : rows;

    // `totalInWindow` (the "X published in 7d window" hint) skipped when the
    // client opts out via `skipTotal=1` — the editor sets that on every fetch
    // after the first per-block load so chip toggles don't re-pay the count
    // cost. Speeds up typical interactions from ~600 ms to ~120 ms.
    let totalInWindow = -1;
    if (sp.get("skipTotal") !== "1") {
      totalInWindow = await prisma.article.count({
        where: { status: "PUBLISHED", publishedAt: { gte: since } },
      });
    }

    return NextResponse.json({
      articles: filtered.map((a: any) => ({
        id: a.id, slug: a.slug, title: a.title,
        featuredImage: a.featuredImage,
        publishedAt: a.publishedAt,
        breaking: a.breaking, featured: a.featured,
        viewCount: a.viewCount,
        category: a.category,
      })),
      totalInWindow,
      windowDays,
    });
  } catch (e) {
    return apiError(e);
  }
}
