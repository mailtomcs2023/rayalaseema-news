import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { ReporterShell } from "@/components/reporter/reporter-shell";
import { KycBanner } from "@/components/reporter/kyc-banner";
import { Wallet, Calendar, Hourglass, CheckCircle2, LockKeyhole } from "lucide-react";

// Reporter Earnings — mirrors the Expo EarningsScreen.
// Brand-red hero card (total) • 3 stat tiles (this month / pending / paid)
// • payment-history list with status-coloured left accent. Locked state
// when KYC isn't VERIFIED.

const STATUS: Record<string, { bg: string; text: string }> = {
  CALCULATED: { bg: "#fef3c7", text: "#92400e" },
  APPROVED: { bg: "#dbeafe", text: "#1d4ed8" },
  PROCESSING: { bg: "#ede9fe", text: "#6d28d9" },
  PAID: { bg: "#dcfce7", text: "#166534" },
};

export default async function ReporterEarningsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id as string | undefined;
  const role = (session.user as any).role as string | undefined;
  if (role && role !== "REPORTER") redirect("/");
  if (!userId) redirect("/login");

  const profile = await prisma.journalistProfile.findUnique({
    where: { userId },
    select: { kycStatus: true },
  });
  const locked = !profile || profile.kycStatus !== "VERIFIED";

  const payments = locked
    ? []
    : await prisma.articlePayment.findMany({
        where: { journalistId: userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          article: { select: { title: true, slug: true } },
          config: { select: { name: true, articleType: true } },
        },
      });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const total = payments.reduce((s, p) => s + (p.totalAmount || 0), 0);
  const paid = payments.filter((p) => p.status === "PAID").reduce((s, p) => s + (p.totalAmount || 0), 0);
  const pending = payments
    .filter((p) => ["CALCULATED", "APPROVED", "PROCESSING"].includes(p.status))
    .reduce((s, p) => s + (p.totalAmount || 0), 0);
  const thisMonth = payments
    .filter((p) => new Date(p.createdAt) >= monthStart)
    .reduce((s, p) => s + (p.totalAmount || 0), 0);

  return (
    <ReporterShell>
      <div style={{ paddingTop: 16 }}>
        <KycBanner userId={userId} />

        {/* Hero — total earnings */}
        <div
          style={{
            backgroundColor: "#FF2C2C",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 4px 12px rgba(255,44,44,0.3)",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <Wallet size={22} color="#fff" />
          </div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>Total Earnings</p>
          <p style={{ fontSize: 36, fontWeight: 900, color: "#fff", marginTop: 2 }}>
            ₹{Math.round(total).toLocaleString("en-IN")}
          </p>
        </div>

        {/* 3-stat row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 24 }}>
          <StatCard Icon={Calendar} tint="#3b82f6" value={thisMonth} label="This Month" />
          <StatCard Icon={Hourglass} tint="#f59e0b" value={pending} label="Pending" />
          <StatCard Icon={CheckCircle2} tint="#16a34a" value={paid} label="Paid" />
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111", marginBottom: 12 }}>
          Payment History
        </h2>

        {locked ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <LockKeyhole size={48} color="#d1d5db" style={{ margin: "0 auto 10px" }} />
            <p style={{ fontSize: 14, color: "#aaa" }}>
              Earnings will appear here once your KYC is verified.
            </p>
          </div>
        ) : payments.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              background: "#fff",
              borderRadius: 14,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <Wallet size={48} color="#d1d5db" style={{ margin: "0 auto 10px" }} />
            <p style={{ fontSize: 14, color: "#aaa" }}>
              No earnings yet. Publish articles to start earning!
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {payments.map((p) => {
              const sc = STATUS[p.status] || { bg: "#f3f4f6", text: "#555" };
              return (
                <div
                  key={p.id}
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: 14,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
                    overflow: "hidden",
                    display: "flex",
                  }}
                >
                  <div style={{ width: 4, backgroundColor: sc.text }} />
                  <div style={{ flex: 1, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, marginRight: 10, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#111",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.article?.title || "Article"}
                        </p>
                        <p style={{ fontSize: 11, color: "#999", marginTop: 3 }}>
                          {p.config?.name || p.config?.articleType || ""} · {new Date(p.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <p style={{ fontSize: 18, fontWeight: 900, color: "#111" }}>
                        ₹{p.totalAmount}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", marginTop: 10, gap: 8 }}>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          letterSpacing: 0.4,
                          color: sc.text,
                          backgroundColor: sc.bg,
                          padding: "3px 8px",
                          borderRadius: 6,
                        }}
                      >
                        {p.status}
                      </span>
                      {p.transactionId ? (
                        <p
                          style={{
                            flex: 1,
                            fontSize: 10,
                            color: "#bbb",
                            fontFamily: "monospace",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Ref: {p.transactionId}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ReporterShell>
  );
}

function StatCard({
  Icon,
  tint,
  value,
  label,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  tint: string;
  value: number;
  label: string;
}) {
  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: 14,
        padding: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          backgroundColor: tint + "1A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
        }}
      >
        <Icon size={16} color={tint} />
      </div>
      <p style={{ fontSize: 17, fontWeight: 900, color: "#111" }}>₹{Math.round(value).toLocaleString("en-IN")}</p>
      <p style={{ fontSize: 11, color: "#888", fontWeight: 600, marginTop: 1 }}>{label}</p>
    </div>
  );
}
