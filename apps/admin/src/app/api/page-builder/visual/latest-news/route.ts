// Live preview data for the visual editor's dynamic card block. The GrapesJS
// editor runs client-side and can't query the DB, so the block fetches this to
// bind real field values into the template while designing. The public
// /page/<slug> renderer does its own server-side fetch (visual-dynamic-blocks).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

const SOURCE_TYPE: Record<string, string> = {
  latest: "ARTICLE",
  featured: "ARTICLE",
  breaking: "BREAKING_NEWS",
  video: "VIDEO",
  reel: "REEL",
  gallery: "PHOTO_GALLERY",
  story: "WEB_STORY",
  cartoon: "CARTOON",
};

export async function GET(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const url = new URL(req.url);
    const source = (url.searchParams.get("source") || "latest").trim();
    const category = (url.searchParams.get("category") || "").trim();
    const count = Math.min(Math.max(Number(url.searchParams.get("count")) || 6, 1), 30);
    const featured = ["1", "true"].includes((url.searchParams.get("featured") || "").toLowerCase());

    // The "categories" source previews Category rows, not Content.
    if (source === "categories") {
      const cats = await prisma.category.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        take: count,
        select: { name: true, description: true, color: true },
      });
      return NextResponse.json({
        items: cats.map((c) => ({
          title: c.name,
          summary: c.description,
          body: null,
          image: null,
          category: c.name,
          categoryColor: c.color ?? "",
          author: "",
          views: 0,
          publishedAt: null,
        })),
      });
    }

    const type = (SOURCE_TYPE[source] || "ARTICLE") as never;

    const items = await prisma.content.findMany({
      where: {
        type,
        status: "PUBLISHED",
        ...(featured || source === "featured" ? { featured: true } : {}),
        ...(category
          ? { OR: [{ category: { slug: category } }, { additionalCategories: { some: { category: { slug: category } } } }] }
          : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: count,
      select: {
        title: true,
        summary: true,
        body: true,
        featuredImage: true,
        publishedAt: true,
        viewCount: true,
        category: { select: { name: true, color: true } },
        author: { select: { name: true } },
      },
    });

    return NextResponse.json({
      items: items.map((a) => ({
        title: a.title,
        summary: a.summary,
        body: a.body,
        image: a.featuredImage,
        category: a.category?.name ?? "",
        categoryColor: a.category?.color ?? "",
        author: a.author?.name ?? "",
        views: a.viewCount ?? 0,
        publishedAt: a.publishedAt,
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}
