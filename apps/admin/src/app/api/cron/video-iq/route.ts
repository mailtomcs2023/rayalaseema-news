import { NextRequest, NextResponse } from "next/server";
import { buildDeps } from "@/lib/video-iq/deps";
import { processQueue } from "@/lib/video-iq/worker";

// POST /api/cron/video-iq
//
// Advances queued Video IQ rows (up to 3 per call, each carried through all
// its stages). Called every 2 minutes by apps/admin/scripts/cron-runner.ts
// under PM2; fresh runs are also kicked off right away by the create route.
// Auth: Bearer <CRON_SECRET>, same as publish-scheduled.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 503 });
  if ((req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processQueue(buildDeps());
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cron/video-iq]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
