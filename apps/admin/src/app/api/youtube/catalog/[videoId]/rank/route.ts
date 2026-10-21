import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { createDataForSeo } from "@rayalaseema/youtube";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { rankCheck } from "@/lib/video-iq/catalog";

// POST /api/youtube/catalog/[videoId]/rank → DataForSEO YouTube SERP check for the title's English half.
type Ctx = { params: Promise<{ videoId: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(auth)) return auth;
  const { videoId } = await ctx.params;
  if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
    return NextResponse.json({ error: "DataForSEO not configured on server" }, { status: 503 });
  }
  try {
    const dfs = createDataForSeo({ login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD });
    const r = await rankCheck({ prisma, dfs }, videoId);
    return NextResponse.json(r);
  } catch (e) {
    const msg = (e as Error).message;
    if (/not whitelisted/i.test(msg)) return NextResponse.json({ error: "DataForSEO refused this server's IP; add it at app.dataforseo.com/api-access" }, { status: 502 });
    return apiError(e);
  }
}
