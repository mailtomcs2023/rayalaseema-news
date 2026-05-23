import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getReporterId } from "@/lib/reporter-auth";

// Category list for the reporter app's article composer. Token-protected,
// returns only active categories.
export async function GET(req: NextRequest) {
  if (!(await getReporterId(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const categories = await prisma.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, nameEn: true, slug: true, color: true },
    });
    return NextResponse.json(categories);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load categories" }, { status: 500 });
  }
}
