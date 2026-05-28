import { ImageResponse } from "next/og";
import { prisma } from "@rayalaseema/db";

// GET /api/og/[slug] - 1200x630 branded OG image for an article.
// Renders the headline + brand bar + category label using next/og's
// ImageResponse (Edge-compatible Satori renderer). #95.
//
// Cached at the CDN for 7 days - title changes propagate within a week
// (acceptable for OG card freshness; promoted A/B winners get the new card
// on next push by appending ?v=<timestamp>).
export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await prisma.content.findUnique({
    where: { slug },
    select: { title: true, summary: true, type: true, category: { select: { name: true } } },
  });
  const title = article?.title || "రాయలసీమ ఎక్స్‌ప్రెస్";
  const category = article?.category?.name || "వార్తలు";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          background: "linear-gradient(135deg, #fff 0%, #fef2f2 100%)",
          padding: 60, justifyContent: "space-between",
          fontFamily: "system-ui",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 12, height: 56, background: "#E01B1B", borderRadius: 2 }} />
          <div style={{ fontSize: 28, fontWeight: 800, color: "#E01B1B", letterSpacing: 1 }}>
            రాయలసీమ ఎక్స్‌ప్రెస్
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{
            fontSize: 18, fontWeight: 700, color: "#fff",
            background: "#E01B1B", padding: "8px 18px", borderRadius: 4,
            alignSelf: "flex-start", textTransform: "uppercase", letterSpacing: 1,
          }}>
            {category}
          </div>
          <div style={{
            fontSize: title.length > 80 ? 48 : 60,
            fontWeight: 900, color: "#111", lineHeight: 1.15,
            maxWidth: 1080,
          }}>
            {title}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, color: "#6b6155" }}>
          <span>THE VOICE OF RAYALASEEMA</span>
          <span style={{ fontWeight: 700 }}>rayalaseemaexpress.com</span>
        </div>
      </div>
    ),
    {
      width: 1200, height: 630,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      },
    },
  );
}
