import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { articlePayloadFrom } from "@/lib/video-iq/studio";

// POST /api/video-iq/[id]/create-article
// Turns a published run into a DRAFT VIDEO article (website page with the
// YouTube link, thumbnail and transcript) and links it to the run. A second
// call returns the existing article instead of creating another.
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await ctx.params;
    const row = await prisma.videoOptimization.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (row.contentId) return NextResponse.json({ contentId: row.contentId, existing: true });
    if (row.status !== "APPLIED" || !row.videoId) return NextResponse.json({ error: "publish the video to YouTube first" }, { status: 409 });

    const draft = articlePayloadFrom(row);
    const content = await prisma.content.create({
      data: {
        type: "VIDEO",
        status: "DRAFT",
        title: draft.title,
        summary: draft.summary,
        editorNote: draft.editorNote,
        breaking: draft.breaking,
        authorId: auth.user.id,
        payload: draft.payload,
      },
      select: { id: true },
    });
    await prisma.videoOptimization.update({ where: { id }, data: { contentId: content.id } });
    await logAudit({ action: "youtube.run.create_article", resource: "content", resourceId: content.id, meta: { runId: id, videoId: row.videoId }, actor: auth.user, req });
    return NextResponse.json({ contentId: content.id }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
