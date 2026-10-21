import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { CHANNEL_ID, getYouTube, youtubeConfigured } from "@/lib/video-iq/youtube";
import { syncChannel } from "@/lib/video-iq/catalog";

// POST /api/cron/channel-sync
// Refreshes the channel catalog (ChannelVideo) from the Data API: ~12 units
// per 250 videos. Called every 30 minutes by the PM2 cron runner and after a
// publish. Auth: Bearer <CRON_SECRET>.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 503 });
  if ((req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!youtubeConfigured()) return NextResponse.json({ error: "YouTube credentials not configured" }, { status: 503 });
  try {
    const result = await syncChannel({ prisma, youtube: getYouTube(prisma), channelId: CHANNEL_ID });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cron/channel-sync]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
