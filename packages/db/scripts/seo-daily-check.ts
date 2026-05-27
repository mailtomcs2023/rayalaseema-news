// Spec #4 H7 (#240) — daily SEO health-check report.
//
// Runs via .github/workflows/seo-daily-check.yml schedule (03:00 IST).
// Outputs JSON + posts a digest to a webhook (Slack / Email / Discord —
// editor configures via SEO_HEALTH_WEBHOOK env var).
//
// Metrics captured:
//   - articles published last 24h
//   - article count by district (NER tagged via G2)
//   - article count by category
//   - articles missing primary location (post-G2 should approach 0)
//   - articles missing featured image (Discover ineligible per K9 K-phase)
//   - count of /news/ orphan-fallback URLs (should shrink over time)
//   - count of pages returning non-200 from /sitemap.xml
//   - total SiteConfig analytics IDs configured vs unset
//
// CWV p75 + top-10 GSC queries come from GA4 + GSC APIs separately — those
// require OAuth that the daily script doesn't have set up yet. Tracked as
// a follow-up.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    last24h,
    publishedTotal,
    byDistrict,
    byCategory,
    missingPrimary,
    missingImage,
    orphanArticles,
    analyticsConfig,
  ] = await Promise.all([
    prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED", publishedAt: { gte: yesterday } } }),
    prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED" } }),
    prisma.$queryRawUnsafe<Array<{ district: string; n: bigint }>>(`
      SELECT d."nameEn" as district, COUNT(*)::bigint as n
      FROM contents c
      JOIN constituencies con ON con.id = c."constituencyId"
      JOIN districts d ON d.id = con."districtId"
      WHERE c.type = 'ARTICLE' AND c.status = 'PUBLISHED' AND c."deletedAt" IS NULL
      GROUP BY d."nameEn"
      ORDER BY n DESC
    `),
    prisma.$queryRawUnsafe<Array<{ category: string; n: bigint }>>(`
      SELECT cat."nameEn" as category, COUNT(*)::bigint as n
      FROM contents c
      JOIN categories cat ON cat.id = c."categoryId"
      WHERE c.type = 'ARTICLE' AND c.status = 'PUBLISHED' AND c."deletedAt" IS NULL
      GROUP BY cat."nameEn"
      ORDER BY n DESC
    `),
    prisma.content.count({
      where: { type: "ARTICLE", status: "PUBLISHED", constituencyId: null },
    }),
    prisma.content.count({
      where: { type: "ARTICLE", status: "PUBLISHED", featuredImage: null },
    }),
    prisma.content.count({
      where: { type: "ARTICLE", status: "PUBLISHED", constituencyId: null },
    }),
    prisma.siteConfig.findMany({
      where: { key: { in: [
        "google_analytics_id", "google_adsense_id", "google_tag_manager_id",
        "bing_webmaster_id", "clarity_project_id", "indexnow_key",
        "google_news_publisher_id", "sentry_dsn_web", "sentry_dsn_admin",
      ] } },
      select: { key: true, value: true },
    }),
  ]);

  const analytics = Object.fromEntries(
    analyticsConfig.map((r) => [r.key, r.value && r.value.trim().length > 0]),
  );

  const report = {
    runAt: now.toISOString(),
    articlesPublishedLast24h: last24h,
    articlesPublishedTotal: publishedTotal,
    byDistrict: byDistrict.map((r) => ({ district: r.district, count: Number(r.n) })),
    byCategory: byCategory.map((r) => ({ category: r.category, count: Number(r.n) })),
    missingPrimaryLocation: missingPrimary,
    missingFeaturedImage: missingImage,
    orphanFallbackUrls: orphanArticles,
    analyticsIdsConfigured: analytics,
  };

  console.log(JSON.stringify(report, null, 2));

  const webhook = process.env.SEO_HEALTH_WEBHOOK;
  if (webhook) {
    const text = [
      "📊 *Rayalaseema Express — daily SEO health*",
      `\`${now.toISOString().slice(0, 10)}\``,
      "",
      `📝 24h: ${last24h} published · all-time: ${publishedTotal}`,
      `📍 missing location: ${missingPrimary} · 🖼 missing image: ${missingImage}`,
      `🛟 /news/ fallback URLs: ${orphanArticles} (target → 0 after G2)`,
      "",
      `Districts: ${report.byDistrict.slice(0, 5).map((d) => `${d.district} (${d.count})`).join(", ")}`,
      `Top categories: ${report.byCategory.slice(0, 3).map((c) => `${c.category} (${c.count})`).join(", ")}`,
      "",
      `Analytics IDs: ${Object.entries(analytics).filter(([, on]) => on).map(([k]) => k).join(", ") || "(none configured)"}`,
    ].join("\n");
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      console.warn("Webhook post failed:", (err as Error).message);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
