import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { enrichKeywords } from "@/lib/video-iq/keywords";
import { buildDfs } from "@/lib/video-iq/deps";
import { repriceRun } from "@/lib/video-iq/reprice";

// POST /api/video-iq/[id]/reprice
// Re-prices the run's keyword terms with DataForSEO (for runs analysed while
// the IP was not whitelisted) and re-scores the row. Spends DataForSEO
// credit, no YouTube quota.
type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await ctx.params;
    const row = await prisma.videoOptimization.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!["READY", "APPROVED", "APPLIED"].includes(row.status)) return NextResponse.json({ error: `run is ${row.status}; wait for READY` }, { status: 409 });
    const dfs = buildDfs();
    if (!dfs) return NextResponse.json({ error: "DataForSEO is not configured on this server" }, { status: 503 });
    const r = await repriceRun(row, { prisma, enrichKeywords, dfs });
    return NextResponse.json(r);
  } catch (e) {
    return apiError(e);
  }
}
