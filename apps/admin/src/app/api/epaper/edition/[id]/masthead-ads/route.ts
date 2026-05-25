import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// PATCH /api/epaper/edition/[id]/masthead-ads
// Body: { slot: string, assetId: string }
//
// Sets EpaperEdition.mastheadAds[slot] = assetId for THIS edition. Render
// looks up the asset at render-time; falls back to auto-pick when null.
// #145.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const slot = (body?.slot as string || "").trim();
    const assetId = (body?.assetId as string || "").trim();
    if (!slot) return NextResponse.json({ error: "slot required" }, { status: 400 });

    const edition = await prisma.epaperEdition.findUnique({ where: { id }, select: { id: true, mastheadAds: true } });
    if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });

    const current = ((edition.mastheadAds as Record<string, string>) || {});
    if (!assetId) delete current[slot];
    else current[slot] = assetId;

    const updated = await prisma.epaperEdition.update({
      where: { id },
      data: { mastheadAds: current as any },
    });
    return NextResponse.json({ ok: true, mastheadAds: updated.mastheadAds });
  } catch (e) { return apiError(e); }
}
