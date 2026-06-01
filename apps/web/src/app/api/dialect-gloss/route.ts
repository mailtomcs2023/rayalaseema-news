import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";

// GET /api/dialect-gloss - full glossary, cached aggressively.
// Small list (curated, hundreds not thousands) so shipping the whole map
// to every article reader is fine and lets the tooltip work without N
// extra requests per page.
export const revalidate = 600;

export async function GET() {
  const rows = await prisma.dialectGloss.findMany({
    select: { token: true, standardTelugu: true, note: true, region: true },
  });
  return NextResponse.json({ glosses: rows }, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}
