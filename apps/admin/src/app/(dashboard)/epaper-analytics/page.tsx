import { Sidebar } from "@/components/sidebar";
import { prisma } from "@rayalaseema/db";

/** Editor-facing analytics for e-paper editions. Reads EpaperPageView
 *  (view + hotspot rows), groups by edition + page + article slug. */
export default async function EpaperAnalyticsPage() {
  // Latest 10 editions with their per-page rollups.
  const editions = await prisma.epaperEdition.findMany({
    where: { active: true },
    orderBy: { date: "desc" },
    take: 10,
    select: { id: true, date: true, edition: true, pageCount: true },
  });

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
