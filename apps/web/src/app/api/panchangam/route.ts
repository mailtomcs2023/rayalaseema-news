import { NextResponse } from "next/server";
import { computePanchangam, getFestivals, computeMuhurthams } from "@/lib/panchang";

// Fully offline panchangam feed - no third-party API, no keys, no credits.
// Computes tithi/nakshatra/yoga/karana/masa + sunrise/sunset/rahu-kalam
// locally and serves curated festivals + derived shubha muhurthams.
// (Replaces the old Prokerala integration that ran out of credits and
// embedded a hard-coded client secret in source.)

export const revalidate = 3600; // recompute hourly

export async function GET() {
  try {
    const now = new Date();
    const today = computePanchangam(now);
    const { items: festivals } = getFestivals(now);
    const muhurthams = computeMuhurthams(now);

    return NextResponse.json(
      {
        today,
        festivals: { thisMonth: festivals, nextMonth: [] },
        muhurthams,
        monthName: now.toLocaleDateString("te-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }),
        source: "రాయలసీమ న్యూస్ పంచాంగం",
      },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (e: any) {
    console.error("Panchangam error:", e?.message);
    return NextResponse.json({ today: {}, festivals: { thisMonth: [] }, muhurthams: [], monthName: "" });
  }
}
