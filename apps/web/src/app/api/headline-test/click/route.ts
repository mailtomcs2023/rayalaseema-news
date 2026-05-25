import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";

// GET /api/headline-test/click?testId=<id>&v=A|B&slug=<slug>
//
// Redirect endpoint for headline-test push notifications. Push variants link
// here so click attribution lands in HeadlineTest.clicksA/B. After counting,
// 302s to the article page.
//
// Public — no auth.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const testId = sp.get("testId");
    const v = sp.get("v");
    const slug = sp.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    if (testId && (v === "A" || v === "B")) {
      // Soft-fail — if the test row was deleted we still send the reader on.
      try {
        await prisma.headlineTest.update({
          where: { id: testId },
          data: v === "A" ? { clicksA: { increment: 1 } } : { clicksB: { increment: 1 } },
        });
      } catch { /* ignore */ }
    }
    return NextResponse.redirect(new URL(`/article/${encodeURIComponent(slug)}`, req.url), 302);
  } catch {
    return NextResponse.json({ error: "click track failed" }, { status: 500 });
  }
}
