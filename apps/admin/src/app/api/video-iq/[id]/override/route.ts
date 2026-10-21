import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { chosenSchema } from "@/lib/video-iq/chosen";

// POST /api/video-iq/[id]/override { note }
// ADMIN only: records why a not_fit video may still be published.

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(["ADMIN"]);
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length < 5) return NextResponse.json({ error: "note must explain the override (5+ characters)" }, { status: 400 });

    const row = await prisma.videoOptimization.findUnique({ where: { id }, select: { id: true, contentId: true, chosen: true } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const chosen = chosenSchema.safeParse(row.chosen);
    if (!chosen.success) return NextResponse.json({ error: "choose a title, thumbnail and SEO before overriding" }, { status: 400 });

    const override = { note, by: auth.user.id, at: new Date().toISOString() };
    const updated = await prisma.videoOptimization.update({ where: { id }, data: { chosen: { ...chosen.data, override } } });
    await logAudit({ action: "video_iq.override", resource: "content", resourceId: row.contentId, meta: { runId: id, note }, actor: auth.user, req });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
