import { NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { fetchAndWritePreciousMetalRates } from "@/lib/jobs/fetch-precious-metals";

// POST /api/precious-metals/sync
//
// On-demand variant of /api/cron/fetch-precious-metals. Triggered by the
// "Sync now from API" button on the /precious-metals admin page. Uses
// session auth (EDITOR or ADMIN), no Bearer secret needed.
export async function POST() {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const result = await fetchAndWritePreciousMetalRates();
    if (!result.ok) return NextResponse.json(result, { status: 502 });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
