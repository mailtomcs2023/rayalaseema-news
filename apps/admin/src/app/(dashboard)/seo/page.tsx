// Spec #4 I2 (#242) — internal SEO dashboard.
//
// One-glance view of the SEO health metrics the daily check (H7 #240)
// computes. Editors land here from the dashboard sidebar; surfaces:
//   - articles published last 24h + total
//   - by-district + by-category breakdown
//   - "needs attention" tiles for missing primary location / featured image
//   - analytics-ID configuration state (GA4 / Bing / Clarity / Sentry / IndexNow)
//   - SiteConfig links to /settings for editors who need to populate IDs
//
// CWV p75 + GSC query data require external OAuth (Google APIs) — they
// land in a follow-up once the GSC + GA4 service accounts are wired. For
// V1 this page is a first-party-data summary that doesn't depend on
// external auth.

import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError } from "@/lib/api-utils";
import { redirect } from "next/navigation";

export const metadata = { title: "SEO Dashboard | Rayalaseema Express Admin" };

const ANALYTICS_KEYS = [
  ["google_analytics_id", "Google Analytics 4"],
  ["google_tag_manager_id", "Google Tag Manager"],
  ["google_adsense_id", "Google AdSense"],
  ["bing_webmaster_id", "Bing Webmaster"],
  ["clarity_project_id", "Microsoft Clarity"],
  ["indexnow_key", "IndexNow (Bing/Yandex)"],
  ["google_news_publisher_id", "Google News Publisher"],
  ["sentry_dsn_web", "Sentry — apps/web"],
  ["sentry_dsn_admin", "Sentry — apps/admin"],
];

export default async function SeoDashboardPage() {
  const session = await requireAuth(["ADMIN", "EDITOR", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) redirect("/login");

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    last24h,
    publishedTotal,
    missingLocation,
    missingImage,
    byDistrict,
    configRows,
  ] = await Promise.all([
    prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED", publishedAt: { gte: yesterday } } }),
    prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED" } }),
    prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED", constituencyId: null } }),
    prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED", featuredImage: null } }),
    prisma.$queryRawUnsafe<Array<{ district: string; n: bigint }>>(`
      SELECT d."nameEn" as district, COUNT(*)::bigint as n
      FROM contents c
      JOIN constituencies con ON con.id = c."constituencyId"
      JOIN districts d ON d.id = con."districtId"
      WHERE c.type = 'ARTICLE' AND c.status = 'PUBLISHED' AND c."deletedAt" IS NULL
      GROUP BY d."nameEn"
      ORDER BY n DESC
    `),
    prisma.siteConfig.findMany({
      where: { key: { in: ANALYTICS_KEYS.map(([k]) => k) } },
      select: { key: true, value: true },
    }),
  ]);

  const configMap = Object.fromEntries(configRows.map((r) => [r.key, (r.value || "").trim()]));

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: "32px 24px", background: "#f9fafb" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111", marginBottom: 6 }}>SEO Dashboard</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 28 }}>
          One-glance view of indexing + analytics health. Detailed daily digest
          posts to your Slack/email via the H7 cron.
        </p>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
          <Tile label="Published last 24h" value={last24h} />
          <Tile label="Total published" value={publishedTotal} />
          <Tile label="Missing primary location" value={missingLocation} flag={missingLocation > 0 ? "warn" : "ok"} />
          <Tile label="Missing featured image" value={missingImage} flag={missingImage > 0 ? "warn" : "ok"} />
        </div>

        {/* By district */}
        <Section title="Articles by district">
          {byDistrict.length === 0 ? (
            <p style={{ color: "#888", fontSize: 14 }}>No published articles tagged to a district yet.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
              {byDistrict.map((r) => (
                <div key={r.district} style={{ background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}>
                  <div style={{ fontSize: 12, color: "#888" }}>{r.district}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{Number(r.n)}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Analytics provider IDs */}
        <Section title="Analytics provider IDs">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>
              {ANALYTICS_KEYS.map(([key, label]) => {
                const value = configMap[key];
                const configured = value && value.length > 0;
                return (
                  <tr key={key} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 0", color: "#111" }}>{label}</td>
                    <td style={{ padding: "10px 0", textAlign: "right" }}>
                      {configured ? (
                        <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>✓ configured</span>
                      ) : (
                        <Link href="/settings" style={{ fontSize: 12, color: "#d97706", fontWeight: 600 }}>⚠ set in settings →</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      </main>
    </div>
  );
}

function Tile({ label, value, flag = "ok" }: { label: string; value: number; flag?: "ok" | "warn" }) {
  return (
    <div style={{ background: "#fff", padding: 16, borderRadius: 10, border: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: flag === "warn" ? "#d97706" : "#111" }}>{value.toLocaleString()}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 12 }}>{title}</h2>
      <div style={{ background: "#fff", padding: 16, borderRadius: 10, border: "1px solid #e5e7eb" }}>{children}</div>
    </section>
  );
}
