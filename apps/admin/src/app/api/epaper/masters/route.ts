import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/epaper/masters - list all masters (lightweight; no layout payload).
// POST /api/epaper/masters - create new master { slug, name, layout, geometryOverride? }.

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const masters = await prisma.epaperMaster.findMany({
      select: { id: true, slug: true, name: true, version: true, updatedAt: true },
      orderBy: { slug: "asc" },
    });
    return NextResponse.json({ masters });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const slug = (body?.slug as string || "").trim();
    const name = (body?.name as string || "").trim();
    if (!slug || !name) return NextResponse.json({ error: "slug + name required" }, { status: 400 });
    if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: "slug must be lowercase + dashes" }, { status: 400 });
    const layout = body?.layout ?? { blocks: [] };
    const master = await prisma.epaperMaster.create({
      data: {
        slug, name,
        layout,
        geometryOverride: body?.geometryOverride ?? undefined,
      },
    });
    return NextResponse.json({ master }, { status: 201 });
  } catch (e) { return apiError(e); }
}
