// PUT /api/menu-builder/menus/[location]/draft — save draftItems (Spec #3 D1).
import { NextRequest, NextResponse } from "next/server";
import { prisma, MenuLocation, safeValidateMenuItems } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

function parseLocation(slug: string): MenuLocation | null {
  const upper = slug.toUpperCase();
  if (upper === "HEADER" || upper === "FOOTER" || upper === "MOBILE") return upper as MenuLocation;
  return null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ location: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { location: slug } = await params;
    const location = parseLocation(slug);
    if (!location) return NextResponse.json({ error: "Invalid location" }, { status: 400 });

    const body = await req.json();
    const validated = safeValidateMenuItems(body.items);
    if (!validated.success) {
      return NextResponse.json({
        error: "Invalid menu shape",
        fieldErrors: validated.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    const menu = await prisma.menu.update({
      where: { location },
      data: { draftItems: validated.data as any },
    });
    return NextResponse.json({ ok: true, updatedAt: menu.updatedAt });
  } catch (e) { return apiError(e); }
}
