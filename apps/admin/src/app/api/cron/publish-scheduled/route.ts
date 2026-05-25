import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { logAudit } from "@/lib/audit";

// POST /api/cron/publish-scheduled
//
// Flips SCHEDULED articles whose scheduledAt has passed into PUBLISHED.
// Auth: Bearer <CRON_SECRET> env var. Set CRON_SECRET in production .env and call
// from PM2 cron / systemd timer / external scheduler at 1-minute intervals.
//
// Example cron (every minute):
//   * * * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     https://admin.rayalaseemaexpress.com/api/cron/publish-scheduled
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  try {
    // Spec #1 #109: query unified Content table. Cron now flips ALL content
    // types (Article, Video, Reel, Story, Cartoon, Breaking) — anything with
    // status=SCHEDULED past its scheduledAt becomes PUBLISHED.
    const due = await prisma.content.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: now } },
      select: { id: true, type: true, slug: true, title: true, scheduledAt: true },
    });

    if (due.length === 0) {
      return NextResponse.json({ published: 0, items: [] });
    }

    // Use scheduledAt as the canonical publishedAt for analytics/feed ordering consistency.
    const updates = await Promise.allSettled(
      due.map((c) =>
        prisma.content.update({
          where: { id: c.id },
          data: { status: "PUBLISHED", publishedAt: c.scheduledAt ?? now },
        })
      )
    );

    const items = due.map((c, i) => ({
      id: c.id,
      type: c.type,
      slug: c.slug,
      title: c.title,
      scheduledAt: c.scheduledAt,
      ok: updates[i].status === "fulfilled",
      error: updates[i].status === "rejected" ? String((updates[i] as PromiseRejectedResult).reason) : null,
    }));
    const ok = items.filter((i) => i.ok).length;

    // Audit log per successfully published row (system actor)
    await Promise.all(
      items.filter((i) => i.ok).map((i) =>
        logAudit({
          action: "content.publish",
          resource: "content",
          resourceId: i.id,
          meta: { via: "cron.publish-scheduled", type: i.type, scheduledAt: i.scheduledAt, title: i.title },
          actor: { id: null, email: "system@cron", role: "SYSTEM" },
          req,
        })
      )
    );

    return NextResponse.json({ published: ok, failed: items.length - ok, items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}

// GET — diagnostics (auth not required, returns counts only)
export async function GET() {
  const now = new Date();
  const [pending, dueNow] = await Promise.all([
    prisma.content.count({ where: { status: "SCHEDULED" } }),
    prisma.content.count({ where: { status: "SCHEDULED", scheduledAt: { lte: now } } }),
  ]);
  return NextResponse.json({ pending, dueNow, serverTime: now.toISOString() });
}
