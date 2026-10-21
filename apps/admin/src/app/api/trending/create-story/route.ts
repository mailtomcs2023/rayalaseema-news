import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { storyDraftFrom } from "@/lib/video-iq/story-draft";

// POST /api/trending/create-story { videoId }
// Creates a DRAFT VIDEO content row prefilled from a competitor video and its
// cluster (spec 12.11). The editor supplies our own footage before publish.

export async function POST(req: NextRequest) {
  const auth = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(auth)) return auth;
  try {
    const body = await req.json().catch(() => ({}));
    const videoId = typeof body.videoId === "string" ? body.videoId : "";
    if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

    const video = await prisma.competitorVideo.findUnique({ where: { videoId }, include: { channel: { select: { name: true } } } });
    if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const cluster = video.topicKey
      ? { titles: (await prisma.competitorVideo.findMany({ where: { topicKey: video.topicKey }, select: { title: true }, take: 20 })).map((v) => v.title) }
      : null;
    const draft = storyDraftFrom(video, cluster);

    const content = await prisma.content.create({
      data: {
        type: "VIDEO",
        status: "DRAFT",
        title: draft.title,
        summary: draft.summary || null,
        editorNote: `${draft.editorNote}\nSeen on: ${video.channel.name}.`,
        authorId: auth.user.id,
        payload: {},
      },
      select: { id: true },
    });
    await logAudit({ action: "trending.create_story", resource: "content", resourceId: content.id, meta: { competitorVideoId: videoId, topicKey: video.topicKey }, actor: auth.user, req });
    return NextResponse.json({ contentId: content.id }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
