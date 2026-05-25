import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { ReporterShell } from "@/components/reporter/reporter-shell";
import { KycBanner } from "@/components/reporter/kyc-banner";
import {
  FileText,
  CheckCircle2,
  Eye,
  PencilLine,
  Wallet,
  ChevronRight,
} from "lucide-react";
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
    <ReporterShell>
      <div style={{ padding: 16 }}>
        <KycBanner userId={userId} />

        <h1 style={{ fontSize: 17, lineHeight: "24px", fontWeight: 800, color: "#111", paddingTop: 8, marginBottom: 4 }}>
          Welcome, {name}
        </h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
          Your articles, earnings, and KYC at a glance.
        </p>

        {/* KPI grid — tappable cards, mirrors the Expo Dashboard KpiCard */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
          <Kpi Icon={FileText}     tint="#3b82f6" value={stats.total}     label="Total articles" href="/reporter/articles" />
          <Kpi Icon={CheckCircle2} tint="#16a34a" value={stats.published} label="Published"      href="/reporter/articles?status=PUBLISHED" />
          <Kpi Icon={Eye}          tint="#f59e0b" value={stats.inReview}  label="In review"      href="/reporter/articles?status=IN_REVIEW" />
          <Kpi Icon={PencilLine}   tint="#6b7280" value={stats.drafts}    label="Drafts"         href="/reporter/articles?status=DRAFT" />
          <Kpi Icon={Wallet}       tint="#FF2C2C" value={`₹${Math.round(stats.earnings).toLocaleString("en-IN")}`} label="Earnings" href="/reporter/earnings" />
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

      </div>
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
        padding: 14,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
        textDecoration: "none",
        color: "inherit",
        display: "block",
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
      <p style={{ fontSize: 22, fontWeight: 900, color: "#111" }}>{value}</p>
      <p style={{ fontSize: 12, color: "#888", fontWeight: 600, marginTop: 1 }}>{label}</p>
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
