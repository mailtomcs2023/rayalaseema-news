import { NextRequest, NextResponse } from "next/server";
import { fetchAndWritePreciousMetalRates } from "@/lib/jobs/fetch-precious-metals";

// POST /api/cron/fetch-precious-metals
//
// Daily job: pulls today's gold + silver spot from goldprice.org and writes
// per-city rows into PreciousMetalRate. Idempotent within a day - safe to
// run on overlapping schedules.
//
// Auth: Bearer <CRON_SECRET> env var. Set CRON_SECRET in production .env
// and configure an external scheduler (PM2 / systemd / cloud scheduler) to
// hit this once daily, e.g. 9:30 AM IST after IBJA publishes morning rates:
//   30 9 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     https://admin.rayalaseemanews.com/api/cron/fetch-precious-metals
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await fetchAndWritePreciousMetalRates();
  if (!result.ok) return NextResponse.json(result, { status: 502 });
  return NextResponse.json(result);
}

// GET - lightweight diagnostics, no auth (returns nothing sensitive).
export async function GET() {
  return NextResponse.json({
    description: "POST with Authorization: Bearer $CRON_SECRET to refresh per-city gold/silver from goldprice.org.",
  });
}
