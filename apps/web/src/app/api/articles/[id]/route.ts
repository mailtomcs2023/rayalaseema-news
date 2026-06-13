import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";

// GET /api/articles/:id - full published article (including the HTML body) for
// the reader app's native article screen. Looks up by id OR slug so the app can
// open either. Returns 404 for missing / unpublished / non-article content.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const article = await prisma.content.findFirst({
    where: {
      OR: [{ id }, { slug: id }],
      type: "ARTICLE",
      status: "PUBLISHED",
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      body: true,
      featuredImage: true,
      publishedAt: true,
      viewCount: true,
      category: { select: { id: true, name: true, nameEn: true, slug: true, color: true } },
      author: { select: { id: true, name: true } },
    },
  });

  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(article, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
