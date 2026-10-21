import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { chosenSchema } from "@/lib/video-iq/chosen";

// POST /api/video-iq/[id]/approve
// Marks the run APPROVED (title + thumbnail approval, spec 4.8) and queues a
// YOUTUBE SocialPost row. Publishing itself is a separate call.

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await ctx.params;
    const row = await prisma.videoOptimization.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (row.status !== "READY" && row.status !== "APPROVED") {
      return NextResponse.json({ error: `run is ${row.status}, not READY` }, { status: 409 });
    }
    const chosen = chosenSchema.safeParse(row.chosen);
    if (!chosen.success) return NextResponse.json({ error: "choose a title, thumbnail and SEO first" }, { status: 400 });
    const verdict = (row.suggestions as { fit?: { verdict?: string } } | null)?.fit?.verdict;
    if (verdict === "not_fit" && !chosen.data.override) {
      return NextResponse.json({ error: "not a fit for this channel; an admin override is required" }, { status: 403 });
    }

    const updated = await prisma.videoOptimization.update({ where: { id }, data: { status: "APPROVED", error: null } });
    // A SocialPost row only makes sense for a run linked to a website article;
    // standalone studio runs have no content yet.
    if (row.contentId) {
      await prisma.socialPost.upsert({
        where: { contentId_platform: { contentId: row.contentId, platform: "YOUTUBE" } },
        create: { contentId: row.contentId, platform: "YOUTUBE", status: "QUEUED" },
        update: { status: "QUEUED", error: null },
      });
    }
    await logAudit({ action: "video_iq.approve", resource: row.contentId ? "content" : "video_optimization", resourceId: row.contentId ?? id, meta: { runId: id, title: chosen.data.title }, actor: auth.user, req });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
