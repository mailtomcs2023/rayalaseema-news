import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";

// GET /api/breaking-news - fetch active breaking news
export async function GET() {
  const items = await prisma.breakingNews.findMany({
    where: {
      active: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { priority: "asc" },
  });

  return NextResponse.json(items, {
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=10" },
  });
}
