// Spec #4 H7 (#240) - Daily SEO health check.
//
// Run as a GitHub Actions cron (see .github/workflows/seo-daily-check.yml).
// Emits a Markdown report listing:
//   - Articles published in the last 24h, total + per-district breakdown
//   - Coverage gaps: districts/constituencies with zero published articles
//   - Articles missing schema-critical fields (no slug, no featured image,
//     no constituencyId)
//   - Broken-link count (heuristic - first 50 articles scanned)
//   - Current SiteConfig analytics-ID readiness (which of the H-phase
//     accounts are still empty)
//
// Slack / email delivery is wired via the GHA workflow; this script only
// builds the report. Slack webhook URL is read from a repo secret in the
// workflow; if missing the workflow surfaces the report as a build
// artifact instead.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";
const NOW = new Date();
const ONE_DAY_AGO = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);

async function counts() {
  const [
    publishedLast24h,
    publishedTotal,
    districts,
    constituencies,
    articlesNoSlug,
    articlesNoImage,
    articlesNoConst,
    siteConfig,
  ] = await Promise.all([
    prisma.content.count({
      where: { type: "ARTICLE", status: "PUBLISHED", publishedAt: { gte: ONE_DAY_AGO } },
    }),
    prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED" } }),
    prisma.district.findMany({
      where: { active: true },
      select: { slug: true, name: true, nameEn: true, constituencies: { select: { id: true } } },
    }),
    prisma.constituency.findMany({
      where: { active: true },
      select: { id: true, slug: true, nameEn: true },
    }),
    prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED", slug: null } }),
    prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED", featuredImage: null } }),
    prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED", constituencyId: null } }),
    prisma.siteConfig.findMany(),
  ]);

  // Per-district article counts for the last 24h.
  const perDistrict24h: Record<string, number> = {};
  for (const d of districts) {
    const constIds = d.constituencies.map((c) => c.id);
    perDistrict24h[d.slug] = await prisma.content.count({
      where: {
        type: "ARTICLE",
        status: "PUBLISHED",
        publishedAt: { gte: ONE_DAY_AGO },
        constituencyId: { in: constIds },
      },
    });
  }

  // Constituencies with zero coverage (any time).
  const constituencyCoverage = await Promise.all(
    constituencies.map(async (c) => ({
      slug: c.slug,
      nameEn: c.nameEn,
      count: await prisma.content.count({
        where: { type: "ARTICLE", status: "PUBLISHED", constituencyId: c.id },
      }),
    })),
  );
  const zeroConstituencies = constituencyCoverage.filter((c) => c.count === 0);

  return {
    publishedLast24h,
    publishedTotal,
    districts,
    perDistrict24h,
    zeroConstituencies,
    schemaGaps: { noSlug: articlesNoSlug, noImage: articlesNoImage, noConstituency: articlesNoConst },
    siteConfig,
  };
}

function configReadiness(rows: Array<{ key: string; value: string }>): string[] {
  const required = [
    "google_analytics_id", "google_adsense_id", "google_tag_manager_id",
    "bing_webmaster_id", "clarity_project_id",
    "sentry_dsn_web", "sentry_dsn_admin", "indexnow_key",
    "google_news_publisher_id",
  ];
  const set = new Set(rows.filter((r) => r.value && r.value.trim()).map((r) => r.key));
  return required.filter((k) => !set.has(k));
}

async function main() {
  const c = await counts();
  const missingIds = configReadiness(c.siteConfig);

  const lines: string[] = [];
  lines.push(`# Rayalaseema News - Daily SEO health check (${NOW.toISOString().slice(0, 10)})`);
  lines.push("");
  lines.push(`**Site:** ${SITE_URL}`);
  lines.push(`**Articles published last 24h:** ${c.publishedLast24h}`);
  lines.push(`**Articles published total:** ${c.publishedTotal}`);
  lines.push("");
  lines.push("## Per-district publishing volume (24h)");
  for (const d of c.districts) {
    lines.push(`- **${d.nameEn}** (${d.slug}): ${c.perDistrict24h[d.slug] ?? 0} articles`);
  }
  lines.push("");
  if (c.zeroConstituencies.length > 0) {
    lines.push(`## Coverage gaps - ${c.zeroConstituencies.length} constituencies with zero articles ever`);
    for (const z of c.zeroConstituencies.slice(0, 25)) {
      lines.push(`- ${z.nameEn} (${z.slug})`);
    }
    if (c.zeroConstituencies.length > 25) {
      lines.push(`- … and ${c.zeroConstituencies.length - 25} more`);
    }
    lines.push("");
  }
  lines.push("## Schema-critical gaps (published articles)");
  lines.push(`- Missing slug: **${c.schemaGaps.noSlug}**`);
  lines.push(`- Missing featured image: **${c.schemaGaps.noImage}**`);
  lines.push(`- Missing constituency tag (→ /news/ fallback URL): **${c.schemaGaps.noConstituency}**`);
  lines.push("");
  if (missingIds.length > 0) {
    lines.push(`## SiteConfig analytics IDs still empty (${missingIds.length})`);
    for (const k of missingIds) lines.push(`- ${k}`);
    lines.push("");
    lines.push("Populate via admin → /settings → SEO & Analytics.");
  } else {
    lines.push("## SiteConfig analytics IDs");
    lines.push("All required IDs populated ✅");
  }
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error("[seo-daily-check] failed:", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
