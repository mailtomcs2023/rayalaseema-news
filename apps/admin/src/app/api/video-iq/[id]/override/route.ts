import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { chosenSchema } from "@/lib/video-iq/chosen";
import { scoresForRow } from "@/lib/video-iq/scores";

// POST /api/video-iq/[id]/override { note, originalFootage? }
// ADMIN only: records why a not_fit video may still be published, and/or that
// the footage is the channel's own (lifts the reused-content cap on fit).

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(["ADMIN"]);
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length < 5) return NextResponse.json({ error: "note must explain the override (5+ characters)" }, { status: 400 });

    const row = await prisma.videoOptimization.findUnique({ where: { id }, select: { id: true, contentId: true, chosen: true, suggestions: true, scores: true, breaking: true } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const chosen = chosenSchema.safeParse(row.chosen);
    if (!chosen.success) return NextResponse.json({ error: "choose a title, thumbnail and SEO before overriding" }, { status: 400 });

    const originalFootage = body.originalFootage === true;
    const override = { note, by: auth.user.id, at: new Date().toISOString(), ...(originalFootage ? { originalFootage: true } : {}) };
    const nextChosen = { ...chosen.data, override };
    const scores = row.suggestions ? scoresForRow({ ...row, chosen: nextChosen }) : undefined;
    const updated = await prisma.videoOptimization.update({ where: { id }, data: { chosen: nextChosen, ...(scores ? { scores } : {}) } });
    await logAudit({ action: "video_iq.override", resource: row.contentId ? "content" : "video_optimization", resourceId: row.contentId ?? id, meta: { runId: id, note, originalFootage }, actor: auth.user, req });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
