import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getYouTube, youtubeConfigured } from "@/lib/video-iq/youtube";
import { pollCompetitors, breakouts } from "@/lib/video-iq/trending";

// POST /api/cron/trending-poll
// Polls the watched competitor channels' RSS feeds (spec 12.11). Called every
// 15 minutes by apps/admin/scripts/cron-runner.ts. Auth: Bearer <CRON_SECRET>.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 503 });
  if ((req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await pollCompetitors({ prisma, youtube: youtubeConfigured() ? getYouTube(prisma) : null });
    const alerts = await breakouts(prisma);
    return NextResponse.json({ ...result, breakouts: alerts });
  } catch (e) {
    console.error("[cron/trending-poll]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
