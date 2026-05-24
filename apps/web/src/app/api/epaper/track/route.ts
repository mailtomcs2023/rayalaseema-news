import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import crypto from "crypto";

// POST /api/epaper/track
// Body: { editionId, pageNumber, articleSlug? }
// Fire-and-forget ping from the /epaper viewer. No auth — public viewer.
// IP + UA get sha256'd into a single short hash so we can approximate uniques
// without storing PII.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.editionId || typeof body?.pageNumber !== "number") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
    const ua = req.headers.get("user-agent") || "";
    const ipHash = crypto.createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 32);
    const referrer = req.headers.get("referer") || null;

    await prisma.epaperPageView.create({
      data: {
        editionId: body.editionId,
        pageNumber: body.pageNumber,
        articleSlug: body.articleSlug || null,
        referrer,
        ipHash,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    // Swallow — never break the viewer over telemetry
    return NextResponse.json({ ok: false });
  }
}
