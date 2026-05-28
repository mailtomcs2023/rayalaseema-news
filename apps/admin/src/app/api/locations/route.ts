import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { cachedJson } from "@/lib/http-cache";

// GET /api/locations[?limit=200] - district + nested constituency + mandal
// tree. Limit caps districts at 200 (max 500) since the nested includes
// can balloon the response if districts grow uncontrolled. Shape stays a
// bare array - consumers (article editor + admin pages) rely on it.
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const limit = Math.min(
      Math.max(parseInt(new URL(req.url).searchParams.get("limit") || "200"), 1),
      500,
    );
    const districts = await prisma.district.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      take: limit,
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
    // Districts/constituencies/mandals are essentially static - change
    // maybe once a year. 30s fresh + 5min SWR.
    return cachedJson(req, districts, { maxAge: 30, staleWhileRevalidate: 300 });
  } catch (error) {
    return apiError(error);
  }
}
