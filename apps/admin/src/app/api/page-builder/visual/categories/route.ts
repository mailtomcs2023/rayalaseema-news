// Category list for the visual editor's dynamic-card "Category" filter dropdown.
import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const categories = await prisma.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { name: true, slug: true },
    });
    return NextResponse.json({ categories });
  } catch (e) {
    return apiError(e);
  }
}
