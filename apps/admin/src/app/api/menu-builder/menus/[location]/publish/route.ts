// POST /api/menu-builder/menus/[location]/publish — promote draft → live
// (Spec #3 D1). Snapshots a MenuVersion before promoting, invalidates the
// web cache via revalidateTag('menu').
import { NextRequest, NextResponse } from "next/server";
import { prisma, MenuLocation, safeValidateMenuItems, Prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { revalidateTag } from "next/cache";

function parseLocation(slug: string): MenuLocation | null {
  const upper = slug.toUpperCase();
  if (upper === "HEADER" || upper === "FOOTER" || upper === "MOBILE") return upper as MenuLocation;
  return null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ location: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { location: slug } = await params;
    const location = parseLocation(slug);
    if (!location) return NextResponse.json({ error: "Invalid location" }, { status: 400 });

    const menu = await prisma.menu.findUnique({ where: { location } });
    if (!menu) return NextResponse.json({ error: "Menu not found" }, { status: 404 });

    const itemsToPublish = menu.draftItems ?? menu.items;
    const validated = safeValidateMenuItems(itemsToPublish);
    if (!validated.success) {
      return NextResponse.json({
        error: "Cannot publish: draft items fail validation",
        fieldErrors: validated.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    // Snapshot the OUTGOING published state before overwriting it so the
    // version history list shows what each publish replaced.
    await prisma.menuVersion.create({
      data: {
        menuId: menu.id,
        items: menu.items as any,
        editedById: session.user.id,
        editNote: null,
      },
    });

    const updated = await prisma.menu.update({
      where: { id: menu.id },
      data: {
        items: validated.data as any,
        draftItems: Prisma.DbNull,
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    // Bust the web-app menu cache (tag set in apps/web/src/lib/menu.ts).
    try { revalidateTag("menu", "global"); } catch {}

    return NextResponse.json({ ok: true, publishedAt: updated.publishedAt });
  } catch (e) { return apiError(e); }
}
