import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";

// GET /api/breaking-news - Spec #1 #133: reads Content with type=BREAKING_NEWS
// and projects to the old BreakingNews row shape so the header ticker
// (apps/web/src/components/header.tsx) doesn't need to change. The legacy
// BreakingNews table is dropped in #189.
export async function GET() {
  const now = new Date();
  const rows = await prisma.content.findMany({
    where: { type: "BREAKING_NEWS", status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
  });

  const items = rows
    .map((r) => {
      const p = (r.payload as Record<string, unknown> | null) || {};
      const expiresAt = p.expiresAt ? new Date(p.expiresAt as string) : null;
      return {
        id: r.id,
        headline: r.title,
        priority: typeof p.priority === "number" ? p.priority : 0,
        active: true,
        expiresAt,
        url: typeof p.url === "string" && p.url.trim() ? p.url.trim() : null,
      };
    })
    .filter((b) => !b.expiresAt || b.expiresAt > now)
    .sort((a, b) => a.priority - b.priority);

  return NextResponse.json(items, {
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=10" },
  });
}
