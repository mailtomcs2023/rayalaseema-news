import { NextRequest, NextResponse } from "next/server";
import { generateHoroscopes } from "@/lib/jobs/generate-horoscope";

// POST /api/cron/horoscope
//
// Daily job: pulls daily + weekly horoscopes for all 12 rashis from
// freehoroscopeapi.com, translates to Telugu (Azure OpenAI), and upserts
// into the Horoscope table. The public /horoscope page reads from there.
// Idempotent within a day - safe to run on overlapping schedules.
//
// Auth: Bearer <CRON_SECRET>. Configure a scheduler to hit this daily, e.g.:
//   0 6 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     https://admin.rayalaseemanews.com/api/cron/horoscope
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 503 });
  }
  if ((req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await generateHoroscopes();
  if (!result.ok) return NextResponse.json(result, { status: 502 });
  return NextResponse.json(result);
}

export function GET() {
  return NextResponse.json({
    description: "POST with Authorization: Bearer $CRON_SECRET to generate daily + weekly rashi phalalu.",
  });
}
