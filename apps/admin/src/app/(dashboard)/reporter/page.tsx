import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { ReporterShell } from "@/components/reporter/reporter-shell";
import { KycBanner } from "@/components/reporter/kyc-banner";
import { FileText, CheckCircle2, Wallet, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
      // Explicit select — avoids pulling unused columns (and side-steps any
      // pending schema columns that haven't been migrated to the local DB yet).
      select: {
        id: true,
        title: true,
        status: true,
        rejectionNote: true,
        viewCount: true,
        createdAt: true,
        category: { select: { name: true, nameEn: true, color: true } },
      },
    }),
    prisma.articlePayment.findMany({
      where: { journalistId: userId },
      select: { totalAmount: true, status: true },
    }),
  ]);

  const total = articles.length;
  const approved = articles.filter((a) => a.status === "APPROVED" || a.status === "PUBLISHED").length;
  const earnings = payments
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + (p.totalAmount || 0), 0);
  const name = session.user.name || "Reporter";

  return (
    <ReporterShell>
      {/* Same horizontal padding as the Expo Dashboard (paddingHorizontal: 14
          for cards, paddingHorizontal: 16 for headings). */}
      <KycBanner userId={userId} />

      <h1 style={{ fontSize: 17, lineHeight: "24px", fontWeight: 800, color: "#111", paddingTop: 16 }}>
        Welcome, {name}
      </h1>

      {/* KPI grid — 3 cards in one row, matching the Expo Dashboard. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, paddingTop: 10, paddingBottom: 6 }}>
        <Kpi Icon={FileText}     tint="#3b82f6" value={total}    label="Total"    href="/reporter/articles" />
        <Kpi Icon={CheckCircle2} tint="#16a34a" value={approved} label="Approved" href="/reporter/articles?status=APPROVED" />
        <Kpi Icon={Wallet}       tint="#FF2C2C" value={`₹${earnings.toLocaleString("en-IN")}`} label="Earnings" href="/reporter/earnings" />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111", paddingTop: 10, paddingBottom: 10 }}>
        My Articles
      </h2>

      {articles.length === 0 ? (
        <div
          style={{
            padding: 48,
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            textAlign: "center",
          }}
        >
          <FileText size={48} color="#d1d5db" style={{ margin: "0 auto 10px" }} />
          <p style={{ fontSize: 14, color: "#aaa" }}>
            No articles yet. Tap the red + button to write your first article.
          </p>
        </div>
      ) : (
        articles.slice(0, 20).map((a) => <ArticleCard key={a.id} article={a} />)
      )}
    </ReporterShell>
  );
}

function Kpi({
  Icon,
  tint,
  value,
  label,
  href,
}: {
  Icon: LucideIcon;
  tint: string;
  value: number | string;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
        textDecoration: "none",
        color: "inherit",
        display: "block",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: tint + "1A",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={18} color={tint} />
        </span>
        <ChevronRight size={16} color="#c4c4c4" />
      </div>
      <p style={{ fontSize: 22, fontWeight: 900, color: "#111", lineHeight: 1.1 }}>{value}</p>
      <p style={{ fontSize: 12, color: "#888", fontWeight: 600, marginTop: 2 }}>{label}</p>
    </Link>
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

// Single article tile — mirrors the Expo Dashboard articleCard:
// rounded-14, padding 14, shadow, status badge on the right.
function ArticleCard({ article }: { article: any }) {
  const sc = STATUS_TINT[article.status] || STATUS_TINT.DRAFT;
  return (
    <div
      style={{
        background: "#fff",
        marginBottom: 10,
        borderRadius: 14,
        padding: 14,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <p style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#111", lineHeight: "20px", marginRight: 8 }}>
          {article.title}
        </p>
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 0.4,
            color: sc.text,
            background: sc.bg,
            padding: "3px 8px",
            borderRadius: 6,
            whiteSpace: "nowrap",
          }}
        >
          {article.status}
        </span>
      </div>
      <p style={{ fontSize: 11, color: "#999", marginTop: 6 }}>
        {article.category?.nameEn || ""} • {article.viewCount || 0} views •{" "}
        {new Date(article.createdAt).toLocaleDateString()}
      </p>
      {article.rejectionNote && article.status === "REJECTED" ? (
        <div
          style={{
            marginTop: 10,
            padding: 9,
            background: "#fef2f2",
            borderRadius: 8,
            borderLeft: "3px solid #dc2626",
          }}
        >
          <p style={{ fontSize: 10, fontWeight: 800, color: "#dc2626" }}>Feedback:</p>
          <p style={{ fontSize: 12, color: "#666", marginTop: 1 }}>{article.rejectionNote}</p>
        </div>
      ) : null}
    </div>
  );
}
