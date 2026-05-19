import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const districts = await prisma.district.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        nameEn: true,
        slug: true,
        constituencies: {
          where: { active: true },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            nameEn: true,
            mandals: {
              where: { active: true },
              orderBy: { sortOrder: "asc" },
              select: { id: true, name: true, nameEn: true },
            },
          },
        },
      },
    });
    return NextResponse.json(districts);
  } catch (error) {
    return apiError(error);
  }
}
