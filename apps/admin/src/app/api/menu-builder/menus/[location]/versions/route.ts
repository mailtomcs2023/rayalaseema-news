// GET /api/menu-builder/menus/[location]/versions - version history list
// (Spec #3 D2 #182). Each row = state of the menu BEFORE that publish.
import { NextRequest, NextResponse } from "next/server";
import { prisma, MenuLocation } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

function parseLocation(slug: string): MenuLocation | null {
  const upper = slug.toUpperCase();
  if (upper === "HEADER" || upper === "FOOTER" || upper === "MOBILE") return upper as MenuLocation;
  return null;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ location: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { location: slug } = await params;
    const location = parseLocation(slug);
    if (!location) return NextResponse.json({ error: "Invalid location" }, { status: 400 });

    const menu = await prisma.menu.findUnique({ where: { location }, select: { id: true } });
    if (!menu) return NextResponse.json({ versions: [] });

    const versions = await prisma.menuVersion.findMany({
      where: { menuId: menu.id },
      include: { editedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ versions });
  } catch (e) { return apiError(e); }
}
