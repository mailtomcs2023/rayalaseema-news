import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { createDataForSeo } from "@rayalaseema/youtube";
import * as media from "@/lib/video-iq/media";
import * as transcribe from "@/lib/video-iq/transcribe";
import * as analyze from "@/lib/video-iq/analyze";
import * as keywords from "@/lib/video-iq/keywords";
import * as thumbnail from "@/lib/video-iq/thumbnail";
import { getYouTube, youtubeConfigured } from "@/lib/video-iq/youtube";
import { processQueue } from "@/lib/video-iq/worker";
import { uploadBuffer } from "@/lib/blob";

// POST /api/cron/video-iq
//
// Advances queued Video IQ rows one stage each (up to 3 per call). Called
// every 2 minutes by apps/admin/scripts/cron-runner.ts under PM2.
// Auth: Bearer <CRON_SECRET>, same as publish-scheduled.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 503 });
  if ((req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dfs = process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD
    ? createDataForSeo({ login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD })
    : null;
  const youtube = youtubeConfigured()
    ? getYouTube(prisma)
    : { listMyPlaylists: async () => [], listCaptions: async () => [], downloadCaption: async () => "" };

  try {
    const result = await processQueue({
      prisma,
      media,
      transcribe,
      analyze,
      keywords,
      thumbnail,
      youtube,
      dfs,
      blob: { uploadBuffer: (b, ext, contentType) => uploadBuffer(b, ext, contentType) },
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cron/video-iq]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
