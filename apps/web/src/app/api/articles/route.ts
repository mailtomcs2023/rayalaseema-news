import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";

// GET /api/articles - fetch articles with optional filters
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const featured = searchParams.get("featured");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: any = { status: "PUBLISHED" };
  if (category) where.category = { slug: category };
  if (featured === "true") where.featured = true;

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, nameEn: true, slug: true, color: true } },
        author: { select: { id: true, name: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.article.count({ where }),
  ]);

  return NextResponse.json({ articles, total, limit, offset }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
