import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { breakouts } from "@/lib/video-iq/trending";

// GET /api/trending/breakouts → local stories on 3+ channels in the last hour
// or a 10x outlier with a town (spec 12.11). Feeds the dashboard banner.
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    return NextResponse.json({ breakouts: await breakouts(prisma) });
  } catch (e) {
    return apiError(e);
  }
}
