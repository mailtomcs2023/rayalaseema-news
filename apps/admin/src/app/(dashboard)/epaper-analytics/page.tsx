import { Sidebar } from "@/components/sidebar";
import { prisma } from "@rayalaseema/db";

/** Editor-facing analytics for e-paper editions. Reads EpaperPageView
 *  (view + hotspot rows), groups by edition + page + article slug.
 *  Also surfaces render-job SLA stats from EpaperRenderJob (#90). */

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export default async function EpaperAnalyticsPage() {
  // Latest 10 editions with their per-page rollups.
  const editions = await prisma.epaperEdition.findMany({
    where: { active: true },
    orderBy: { date: "desc" },
    take: 10,
    select: { id: true, date: true, edition: true, pageCount: true },
  });

  // Render-job SLA stats over the last 30 days.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const jobs = await prisma.epaperRenderJob.findMany({
    where: { createdAt: { gte: since } },
    select: { status: true, durationMs: true, retries: true, lastError: true, createdAt: true, editionId: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const succeeded = jobs.filter((j) => j.status === "succeeded");
  const failed = jobs.filter((j) => j.status === "failed");
  const durations = succeeded.map((j) => j.durationMs || 0).filter((d) => d > 0);
  const successRate = jobs.length > 0 ? ((succeeded.length / jobs.length) * 100) : 100;
  const retriedJobs = jobs.filter((j) => j.retries > 0);
  const recentFailures = failed.slice(0, 5);

  const editionIds = editions.map((e) => e.id);

  const pageRollup = editionIds.length
    ? await prisma.epaperPageView.groupBy({
        by: ["editionId", "pageNumber"],
        where: { editionId: { in: editionIds }, articleSlug: null },
        _count: { _all: true },
      })
    : [];

  const clickRollup = editionIds.length
    ? await prisma.epaperPageView.groupBy({
        by: ["editionId", "articleSlug"],
        where: { editionId: { in: editionIds }, articleSlug: { not: null } },
        _count: { _all: true },
      })
    : [];

  // Per-edition: { pageNumber → views }, { slug → clicks }
  const viewsByEdition = new Map<string, Map<number, number>>();
  for (const r of pageRollup) {
    const m = viewsByEdition.get(r.editionId) || new Map();
    m.set(r.pageNumber, r._count._all);
    viewsByEdition.set(r.editionId, m);
  }
  const clicksByEdition = new Map<string, Array<{ slug: string; count: number }>>();
  for (const r of clickRollup) {
    if (!r.articleSlug) continue;
    const arr = clicksByEdition.get(r.editionId) || [];
    arr.push({ slug: r.articleSlug, count: r._count._all });
    clicksByEdition.set(r.editionId, arr);
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 16 }}>ePaper Analytics</h1>

        {/* Render SLA panel - last 30 days of EpaperRenderJob */}
        <section style={{ background: "#fff", padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111", marginBottom: 8 }}>Render SLA (last 30 days)</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <div><div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>Total jobs</div><div style={{ fontSize: 22, fontWeight: 800 }}>{jobs.length}</div></div>
            <div><div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>Success rate</div><div style={{ fontSize: 22, fontWeight: 800, color: successRate >= 95 ? "#16a34a" : successRate >= 85 ? "#d97706" : "#dc2626" }}>{successRate.toFixed(1)}%</div></div>
            <div><div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>P50 duration</div><div style={{ fontSize: 22, fontWeight: 800 }}>{(pct(durations, 50) / 1000).toFixed(1)}s</div></div>
            <div><div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>P95 duration</div><div style={{ fontSize: 22, fontWeight: 800 }}>{(pct(durations, 95) / 1000).toFixed(1)}s</div></div>
            <div><div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>P99 duration</div><div style={{ fontSize: 22, fontWeight: 800 }}>{(pct(durations, 99) / 1000).toFixed(1)}s</div></div>
            <div><div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>Retried</div><div style={{ fontSize: 22, fontWeight: 800, color: retriedJobs.length > 0 ? "#d97706" : "#16a34a" }}>{retriedJobs.length}</div></div>
            <div><div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>Failed</div><div style={{ fontSize: 22, fontWeight: 800, color: failed.length > 0 ? "#dc2626" : "#16a34a" }}>{failed.length}</div></div>
          </div>
          {recentFailures.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, color: "#991b1b", marginBottom: 6 }}>Recent failures</h3>
              <ul style={{ fontSize: 11, color: "#374151", paddingLeft: 16 }}>
                {recentFailures.map((f, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <span style={{ color: "#6b7280" }}>{f.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                    {" - "}
                    <code style={{ color: "#dc2626" }}>{(f.lastError || "unknown error").slice(0, 120)}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
          Last 10 editions · per-page reads + top article click-throughs.
          Tracked via <code>/api/epaper/track</code> from the public viewer.
        </p>
        {editions.length === 0 && <p style={{ fontSize: 13, color: "#888" }}>No editions yet.</p>}
        {editions.map((e) => {
          const dateStr = e.date.toISOString().slice(0, 10);
          const views = viewsByEdition.get(e.id) || new Map();
          const totalViews = Array.from(views.values()).reduce((a, b) => a + b, 0);
          const sortedPages = Array.from(views.entries()).sort((a, b) => a[0] - b[0]);
          const topClicks = (clicksByEdition.get(e.id) || []).sort((a, b) => b.count - a.count).slice(0, 10);

          return (
            <section key={e.id} style={{ background: "#fff", padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>{dateStr} · {e.edition} · {e.pageCount} pages · <span style={{ color: "#4f46e5" }}>{totalViews} total views</span></h2>
              {sortedPages.length === 0 ? (
                <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>No views recorded yet.</p>
              ) : (
                <table style={{ width: "100%", marginTop: 12, fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      <th style={{ padding: 6, textAlign: "left" }}>Page</th>
                      <th style={{ padding: 6, textAlign: "right" }}>Views</th>
                      <th style={{ padding: 6, textAlign: "right" }}>% of total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPages.map(([pn, v]) => (
                      <tr key={pn} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: 6 }}>Page {pn}</td>
                        <td style={{ padding: 6, textAlign: "right", fontWeight: 700 }}>{v}</td>
                        <td style={{ padding: 6, textAlign: "right", color: "#6b7280" }}>{totalViews > 0 ? ((v / totalViews) * 100).toFixed(1) : "0"}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {topClicks.length > 0 && (
                <>
                  <h3 style={{ fontSize: 12, fontWeight: 800, color: "#374151", marginTop: 14 }}>Top article click-throughs</h3>
                  <ul style={{ marginTop: 6, fontSize: 12 }}>
                    {topClicks.map((c) => (
                      <li key={c.slug} style={{ padding: "4px 0", borderBottom: "1px dotted #e5e7eb" }}>
                        <a href={`/article/${c.slug}`} target="_blank" rel="noopener" style={{ color: "#4f46e5" }}>{c.slug}</a>
                        <span style={{ float: "right", fontWeight: 700 }}>{c.count}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
