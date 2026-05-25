import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";

// GET /api/categories - fetch all active categories
export async function GET() {
  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { contents: true } },
    },
  });

  return NextResponse.json(categories, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
