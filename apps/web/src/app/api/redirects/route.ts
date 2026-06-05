import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";

// Redirect map (fromPath -> { to, status }) consumed by middleware.ts. Always
// reads fresh from the DB; the middleware caches the result in-isolate for 60s,
// so this endpoint is hit ~once per minute, not per request.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await prisma.redirect.findMany({
      select: { fromPath: true, toPath: true, statusCode: true },
    });
    const map: Record<string, { to: string; status: number }> = {};
    for (const r of rows) map[r.fromPath] = { to: r.toPath, status: r.statusCode };
    return NextResponse.json(map);
  } catch {
    // Fail open - a redirects outage must never 500 the whole site.
    return NextResponse.json({});
  }
}
