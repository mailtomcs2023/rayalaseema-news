// POST .../versions/[versionId]/restore - copy a historical version's items
// back into the draft (Spec #3 D2 #182). The admin can then publish that
// draft to promote it live; restore alone never changes the public state.
import { NextRequest, NextResponse } from "next/server";
import { prisma, MenuLocation } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

function parseLocation(slug: string): MenuLocation | null {
  const upper = slug.toUpperCase();
  if (upper === "HEADER" || upper === "FOOTER" || upper === "MOBILE") return upper as MenuLocation;
  return null;
}

export async function POST(_: NextRequest, { params }: { params: Promise<{ location: string; versionId: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { location: slug, versionId } = await params;
    const location = parseLocation(slug);
    if (!location) return NextResponse.json({ error: "Invalid location" }, { status: 400 });

    const menu = await prisma.menu.findUnique({ where: { location } });
    if (!menu) return NextResponse.json({ error: "Menu not found" }, { status: 404 });

    const version = await prisma.menuVersion.findUnique({ where: { id: versionId } });
    if (!version || version.menuId !== menu.id) {
      return NextResponse.json({ error: "Version not found for this menu" }, { status: 404 });
    }

    await prisma.menu.update({
      where: { id: menu.id },
      data: { draftItems: version.items as any },
    });

    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}
