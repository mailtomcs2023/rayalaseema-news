import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { ReporterShell } from "@/components/reporter/reporter-shell";
import { KycBanner } from "@/components/reporter/kyc-banner";
import { FileText } from "lucide-react";

// Reporter Articles page — mirrors the Expo ArticlesScreen.
// Status filter chips + the full list of the reporter's own articles.
// Filter state lives in the URL (`?status=SUBMITTED`) so it survives a
// reload and is shareable.

const FILTERS = [
  { value: "SUBMITTED", label: "Submitted" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Drafts" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

const STATUS_TINT: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#f3f4f6", text: "#555" },
  SUBMITTED: { bg: "#fef3c7", text: "#92400e" },
  IN_REVIEW: { bg: "#dbeafe", text: "#1d4ed8" },
  APPROVED: { bg: "#dcfce7", text: "#166534" },
  PUBLISHED: { bg: "#dcfce7", text: "#166534" },
  REJECTED: { bg: "#fef2f2", text: "#dc2626" },
};

export default async function ReporterArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id as string | undefined;
  const role = (session.user as any).role as string | undefined;
  if (role && role !== "REPORTER") redirect("/");
  if (!userId) redirect("/login");

  const sp = await searchParams;
  const filter: Filter = (FILTERS.find((f) => f.value === sp.status)?.value ?? "SUBMITTED") as Filter;

  const articles = await prisma.article.findMany({
    where: { authorId: userId, status: filter },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { category: { select: { name: true, nameEn: true, color: true } } },
  });

  // Counts per status so the chips show "Submitted (3)" etc. — same UX as
  // the Expo app.
  const counts = await prisma.article.groupBy({
    by: ["status"],
    _count: { _all: true },
    where: { authorId: userId },
  });
  const countByStatus: Record<string, number> = {};
  for (const c of counts) countByStatus[c.status] = c._count._all;

  return (
    <ReporterShell>
      <div style={{ padding: 16 }}>
        <KycBanner userId={userId} />

        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 4 }}>
          My Articles
        </h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
          Track the status of every article you&apos;ve written.
        </p>

        {/* Status filter chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {FILTERS.map((f) => {
            const active = filter === f.value;
            const n = countByStatus[f.value] || 0;
            return (
              <Link
                key={f.value}
                href={`/reporter/articles?status=${f.value}`}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: "none",
                  border: active ? "1px solid transparent" : "1px solid #e5e7eb",
                  backgroundColor: active ? "#FF2C2C" : "#fff",
                  color: active ? "#fff" : "#555",
                  boxShadow: active ? "0 1px 2px rgba(255,44,44,0.25)" : "0 1px 2px rgba(0,0,0,0.04)",
                }}
              >
                {f.label} {n > 0 ? <span style={{ opacity: 0.85 }}>· {n}</span> : null}
              </Link>
            );
          })}
        </div>

        {/* Article list */}
        {articles.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <FileText size={48} color="#d1d5db" style={{ margin: "0 auto 10px" }} />
            <p style={{ fontSize: 14, color: "#aaa" }}>
              No {filter.toLowerCase().replace("_", " ")} articles yet.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {articles.map((a) => {
              const sc = STATUS_TINT[a.status] || STATUS_TINT.DRAFT;
              return (
                <div
                  key={a.id}
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 14,
                    padding: 14,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <p style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#111", lineHeight: 1.4 }}>
                      {a.title}
                    </p>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: 0.4,
                        color: sc.text,
                        backgroundColor: sc.bg,
                        padding: "3px 8px",
                        borderRadius: 6,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.status}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: "#999", marginTop: 6 }}>
                    {a.category?.nameEn || ""} · {a.viewCount || 0} views · {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                  {a.rejectionNote && a.status === "REJECTED" ? (
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
                      <p style={{ fontSize: 12, color: "#666", marginTop: 1 }}>{a.rejectionNote}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ReporterShell>
  );
}
