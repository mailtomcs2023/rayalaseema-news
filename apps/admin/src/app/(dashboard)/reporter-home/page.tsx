import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { Sidebar } from "@/components/sidebar";

// Reporter-only landing page in the admin portal. The middleware bounces
// any non-reporter that ends up here to landingFor(role), and bounces any
// reporter that tries to visit a non-reporter route here. The page itself
// is a read-only summary; writing new articles still happens in the Expo
// mobile app (today's primary reporter workflow).
//
// Server-rendered so the data is fresh on every visit — no client-side
// loading flicker, no extra round-trip.
export default async function ReporterHome() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id as string | undefined;
  const role = (session.user as any).role as string | undefined;
  // Defensive: editorial staff shouldn't be on this page; bounce them.
  if (role && role !== "REPORTER") redirect("/");
  if (!userId) redirect("/login");

  const [articles, payments] = await Promise.all([
    prisma.article.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { category: { select: { name: true, nameEn: true, color: true } } },
    }),
    prisma.articlePayment.findMany({
      where: { journalistId: userId },
      select: { totalAmount: true, status: true },
    }),
  ]);

  const stats = {
    total: articles.length,
    published: articles.filter((a) => a.status === "PUBLISHED").length,
    inReview: articles.filter((a) => a.status === "SUBMITTED" || a.status === "IN_REVIEW").length,
    drafts: articles.filter((a) => a.status === "DRAFT").length,
    earnings: payments.reduce((s, p) => s + (p.totalAmount || 0), 0),
  };

  const name = session.user.name || "Reporter";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>
          Welcome, {name}
        </h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
          Your articles, earnings, and KYC at a glance. Use the mobile app to write new articles.
        </p>

        {/* KPI grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
          <Kpi label="Total articles" value={stats.total} tint="#3b82f6" />
          <Kpi label="Published" value={stats.published} tint="#16a34a" />
          <Kpi label="In review" value={stats.inReview} tint="#f59e0b" />
          <Kpi label="Drafts" value={stats.drafts} tint="#6b7280" />
          <Kpi label="Earnings" value={`₹${Math.round(stats.earnings).toLocaleString("en-IN")}`} tint="#FF2C2C" />
        </div>

        {/* Recent articles */}
        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", padding: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111", marginBottom: 12 }}>
            Your articles
          </h2>
          {articles.length === 0 ? (
            <p style={{ fontSize: 13, color: "#aaa", padding: 24, textAlign: "center" }}>
              No articles yet. Open the mobile app to write your first article.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {articles.slice(0, 20).map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "#f9fafb",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/articles/${a.id}`}
                      style={{ fontSize: 14, fontWeight: 700, color: "#111", textDecoration: "none" }}
                    >
                      {a.title}
                    </Link>
                    <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {a.category && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#fff",
                            background: a.category.color || "#888",
                            padding: "2px 8px",
                            borderRadius: 4,
                          }}
                        >
                          {a.category.nameEn}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: "#888" }}>
                        {new Date(a.createdAt).toLocaleDateString()}
                      </span>
                      {a.rejectionNote && a.status === "REJECTED" ? (
                        <span style={{ fontSize: 11, color: "#dc2626", fontStyle: "italic" }}>
                          Rejected: {a.rejectionNote.slice(0, 80)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <p style={{ marginTop: 18, fontSize: 12, color: "#888", textAlign: "center" }}>
          To write a new article or edit a draft, please use the Rayalaseema Express reporter app on your phone.
        </p>
      </main>
    </div>
  );
}

function Kpi({ label, value, tint }: { label: string; value: number | string; tint: string }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ width: 28, height: 28, borderRadius: 8, background: tint + "1A", marginBottom: 8 }} />
      <p style={{ fontSize: 20, fontWeight: 900, color: "#111" }}>{value}</p>
      <p style={{ fontSize: 11, color: "#888", fontWeight: 600, marginTop: 2 }}>{label}</p>
    </div>
  );
}

const STATUS_TINT: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#f3f4f6", text: "#555" },
  SUBMITTED: { bg: "#fef3c7", text: "#92400e" },
  IN_REVIEW: { bg: "#dbeafe", text: "#1d4ed8" },
  APPROVED: { bg: "#dcfce7", text: "#166534" },
  PUBLISHED: { bg: "#dcfce7", text: "#166534" },
  REJECTED: { bg: "#fef2f2", text: "#dc2626" },
};

function StatusBadge({ status }: { status: string }) {
  const t = STATUS_TINT[status] || STATUS_TINT.DRAFT;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        color: t.text,
        background: t.bg,
        padding: "3px 10px",
        borderRadius: 6,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}
