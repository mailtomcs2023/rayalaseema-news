import Link from "next/link";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { getDashboardStats } from "@/lib/admin-queries";
import { auth } from "@/lib/auth";
import { landingFor } from "@/lib/roles";

export default async function DashboardPage() {
  // Reporters get bounced to their own portal (since middleware no longer
  // does role-based routing). Sub editors land here too but the sidebar
  // hides items they can't use.
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (role === "REPORTER") redirect(landingFor("REPORTER"));

  const stats = await getDashboardStats();

  const statCards = [
    { label: "Published", value: stats.publishedArticles, color: "#16a34a", href: "/content", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
    { label: "Drafts", value: stats.draftArticles, color: "#eab308", href: "/content", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" },
    { label: "In Review", value: stats.inReviewArticles, color: "#3b82f6", href: "/content", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
    { label: "Categories", value: stats.totalCategories, color: "#8b5cf6", href: "/categories", icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" },
    { label: "Breaking News", value: stats.breakingNewsCount, color: "#ef4444", href: "/breaking-news", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
    { label: "Videos", value: stats.totalVideos, color: "#ec4899", href: "/videos", icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
    { label: "Web Stories", value: stats.totalStories, color: "#f59e0b", href: "/stories", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
    { label: "Reels", value: stats.totalReels, color: "#14b8a6", href: "/reels", icon: "M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" },
    { label: "Cartoons", value: stats.totalCartoons, color: "#6366f1", href: "/cartoons", icon: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { label: "Active Ads", value: stats.totalAds, color: "#64748b", href: "/ads", icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        {/* Header */}
        <div className="dashboard-header">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>Dashboard</h1>
            <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Welcome to Rayalaseema News CMS</p>
          </div>
          <Link
            href="/content/new"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", background: "#FF2C2C", color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none" }}
          >
            + New Article
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="stat-grid">
          {statCards.map((s) => (
            <Link key={s.label} href={s.href} className="stat-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ width: 40, height: 40, borderRadius: 10, background: `${s.color}1a`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" fill="none" stroke={s.color} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
                  </svg>
                </span>
                <span className="stat-value">{(s.value ?? 0).toLocaleString()}</span>
              </div>
              <p style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginTop: 14 }}>{s.label}</p>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="quick-grid">
          {[
            // "New Content" and "Breaking News" both land on the /content/new
            // type picker right now — until the picker supports a `?type=` query
            // to skip straight to BREAKING_NEWS, both shortcuts share the same
            // href. Key off label (unique) instead of href so React doesn't warn.
            { label: "New Content", href: "/content/new", icon: "+" },
            { label: "Breaking News", href: "/content/new", icon: "!" },
            { label: "Upload ePaper", href: "/epaper", icon: "^" },
            { label: "Add Category", href: "/categories", icon: "#" },
          ].map((a) => (
            <Link key={a.label} href={a.href} style={{ background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", textDecoration: "none", textAlign: "center" }}>
              <span style={{ fontSize: 28, display: "block", marginBottom: 8 }}>{a.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>{a.label}</span>
            </Link>
          ))}
        </div>

        {/* Recent Articles */}
        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Recent Articles</h2>
            <Link href="/articles" style={{ fontSize: 13, color: "#FF2C2C", fontWeight: 600, textDecoration: "none" }}>View All</Link>
          </div>
          <div className="table-scroll">
          <table style={{ width: "100%", minWidth: 680, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                <th style={{ padding: "10px 20px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Title</th>
                <th style={{ padding: "10px 20px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Category</th>
                <th style={{ padding: "10px 20px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Author</th>
                <th style={{ padding: "10px 20px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "10px 20px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Views</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentArticles.map((article: any) => (
                <tr key={article.id} style={{ borderBottom: "1px solid #f9fafb" }}>
                  <td style={{ padding: "12px 20px", fontSize: 13, fontWeight: 600, color: "#111", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Link href={`/content/${article.id}`} style={{ color: "#111", textDecoration: "none" }}>
                      {article.title.substring(0, 50)}...
                    </Link>
                  </td>
                  <td style={{ padding: "12px 20px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "#FF2C2C", padding: "2px 8px", borderRadius: 4 }}>
                      {article.category?.nameEn || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px", fontSize: 12, color: "#888" }}>{article.author?.name || ""}</td>
                  <td style={{ padding: "12px 20px" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                      background: article.status === "PUBLISHED" ? "#dcfce7" : article.status === "DRAFT" ? "#fef3c7" : "#dbeafe",
                      color: article.status === "PUBLISHED" ? "#166534" : article.status === "DRAFT" ? "#92400e" : "#1e40af",
                    }}>
                      {article.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px", fontSize: 12, color: "#888" }}>{article.viewCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </main>
    </div>
  );
}
