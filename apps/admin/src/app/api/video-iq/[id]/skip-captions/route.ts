import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { buildDeps } from "@/lib/video-iq/deps";
import { processQueue } from "@/lib/video-iq/worker";

// POST /api/video-iq/[id]/skip-captions
// A back-catalog run waiting for YouTube's caption track continues now from
// the title and description (low-confidence analysis) instead of waiting.
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await ctx.params;
    const row = await prisma.videoOptimization.findUnique({ where: { id }, select: { id: true, status: true, source: true, suggestions: true, transcript: true } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (row.source !== "YOUTUBE" || row.status !== "TRANSCRIBING" || row.transcript) {
      return NextResponse.json({ error: "this run is not waiting for captions" }, { status: 409 });
    }
    const suggestions = { ...((row.suggestions as Record<string, unknown>) ?? {}), skipCaptions: true };
    // Reset updatedAt into the past so the worker can claim it right away.
    await prisma.videoOptimization.update({ where: { id }, data: { suggestions, error: null, updatedAt: new Date(Date.now() - 120_000) } });
    after(async () => { try { await processQueue(buildDeps(), 1); } catch (e) { console.error("[video-iq] skip-captions kick", e); } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
