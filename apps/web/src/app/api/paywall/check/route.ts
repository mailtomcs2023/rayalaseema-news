import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import crypto from "node:crypto";

// POST /api/paywall/check  Body: { articleSlug }
//
// Anonymous reader paywall (#93). Counts unique-article reads in a rolling
// 30-day window per fingerprint = SHA-256(UA + IP-hash + lang). When the
// reader exceeds PAYWALL_LIMIT distinct articles, returns allowed=false so
// the client renders the subscribe modal.
//
// Re-reading the same article doesn't tick the counter. Logged-in users
// short-circuit (subscription bypass) - left as TODO until auth lands on web.
//
// No PII stored - fingerprint is a one-way hash, IP itself never written.

const PAYWALL_LIMIT = parseInt(process.env.PAYWALL_FREE_ARTICLES_PER_MONTH || "5", 10);

function fingerprint(req: NextRequest): string {
  const ua = req.headers.get("user-agent") || "";
  const lang = req.headers.get("accept-language") || "";
  const fwd = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "0.0.0.0";
  const ip = fwd.split(",")[0].trim();
  const ipHash = crypto.createHash("sha256").update(ip + (process.env.PAYWALL_SALT || "re-fp")).digest("hex").slice(0, 16);
  return crypto.createHash("sha256").update(`${ua}|${ipHash}|${lang}`).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const slug = (body?.articleSlug as string || "").trim();
    if (!slug) return NextResponse.json({ error: "articleSlug required" }, { status: 400 });

    const fp = fingerprint(req);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Distinct articles read in the window.
    const reads = await prisma.articleReadEvent.findMany({
      where: { fingerprint: fp, createdAt: { gte: since } },
      select: { articleSlug: true },
    });
    const distinctSlugs = new Set(reads.map((r) => r.articleSlug));
    const alreadyRead = distinctSlugs.has(slug);

    // If they've already read this article, never bill it twice.
    if (alreadyRead) {
      return NextResponse.json({ allowed: true, count: distinctSlugs.size, limit: PAYWALL_LIMIT, reason: "already-read" });
    }

    // Net-new article - would they go over the limit?
    if (distinctSlugs.size >= PAYWALL_LIMIT) {
      return NextResponse.json({ allowed: false, count: distinctSlugs.size, limit: PAYWALL_LIMIT, reason: "limit-reached" });
    }

    // Allowed - record the read so future requests count it.
    await prisma.articleReadEvent.create({
      data: { fingerprint: fp, articleSlug: slug },
    });
    return NextResponse.json({ allowed: true, count: distinctSlugs.size + 1, limit: PAYWALL_LIMIT });
  } catch (e) {
    // Soft-fail open - never let a metering bug block reading.
    return NextResponse.json({ allowed: true, count: 0, limit: PAYWALL_LIMIT, error: "metering-failed" });
  }
}
