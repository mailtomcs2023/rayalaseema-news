import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { ReporterShell } from "@/components/reporter/reporter-shell";
import { KycBanner } from "@/components/reporter/kyc-banner";
import { SignOutButton } from "@/components/reporter/sign-out-button";
import { ShieldCheck } from "lucide-react";

// Reporter Profile — mirrors the Expo ProfileScreen.
// Avatar hero • role + KYC pills • optional KYC rejection box •
// grouped settings-style menu rows • sign out.
//
// The mobile app has dedicated editor screens for every section
// (/profile-section/<key>, /profile-password, /kyc). The web portal is
// read-only for now; tapping a row sends the reporter back to the mobile
// app for editing — same constraint as the rest of the reporter web UI.

const KYC_PILL: Record<string, { label: string; bg: string; text: string }> = {
  PENDING: { label: "KYC pending", bg: "#fef3c7", text: "#92400e" },
  SUBMITTED: { label: "KYC under review", bg: "#dbeafe", text: "#1d4ed8" },
  VERIFIED: { label: "KYC verified", bg: "#dcfce7", text: "#166534" },
  REJECTED: { label: "KYC rejected", bg: "#fef2f2", text: "#dc2626" },
};

export default async function ReporterProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id as string | undefined;
  const role = (session.user as any).role as string | undefined;
  if (role && role !== "REPORTER") redirect("/");
  if (!userId) redirect("/login");

  const data = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatar: true,
      reporterProfile: {
        select: {
          kycStatus: true,
          kycRejectionNote: true,
          photoUrl: true,
          fatherName: true,
          gender: true,
          specialization: true,
          address: true,
          city: true,
          pincode: true,
          aadhaarNumber: true,
          panNumber: true,
          upiId: true,
          bankName: true,
        },
      },
    },
  });
  if (!data) redirect("/login");

  const p = data.reporterProfile;

  // Pending profile-update requests — drives the badge on the row.
  // ProfileUpdateRequest is keyed by ReporterProfile.id, not User.id.
  const pendingCount = (await prisma.reporterProfile
    .findUnique({
      where: { userId },
      select: { _count: { select: { profileUpdateRequests: { where: { status: "PENDING" } } } } },
    })
    .catch(() => null))?._count.profileUpdateRequests ?? 0;
  const kycStatus = (p?.kycStatus as keyof typeof KYC_PILL) ?? "PENDING";
  const kycPill = KYC_PILL[kycStatus];
  const photoUrl = p?.photoUrl || data.avatar;
  const initials = (data.name || "R")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ReporterShell>
      <div style={{ paddingTop: 14 }}>
        <KycBanner userId={userId} />

        {/* Avatar hero card — large centred avatar + name + role/KYC pills. */}
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            padding: "26px 20px",
            marginBottom: 14,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 104,
              height: 104,
              borderRadius: 52,
              background: "#FF2C2C",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: 1,
              overflow: "hidden",
              marginBottom: 14,
              boxShadow: "0 5px 18px rgba(255,44,44,0.3)",
            }}
          >
            {photoUrl ? (
              <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              initials || "R"
            )}
          </div>
          <p style={{ fontSize: 20, lineHeight: "26px", fontWeight: 800, color: "#111", textAlign: "center" }}>
            {data.name || "—"}
          </p>
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 8,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(255,44,44,0.08)",
                color: "#FF2C2C",
                padding: "5px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <ShieldCheck size={12} />
              Reporter
            </span>
            <span
              style={{
                background: kycPill.bg,
                color: kycPill.text,
                padding: "5px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {kycPill.label}
            </span>
          </div>

          {/* KYC rejection note, mirrors the kycRejectBox in the Expo screen. */}
          {kycStatus === "REJECTED" && p?.kycRejectionNote ? (
            <div
              style={{
                alignSelf: "stretch",
                marginTop: 14,
                padding: 10,
                background: "#fef2f2",
                borderRadius: 8,
                borderLeft: "3px solid #dc2626",
              }}
            >
              <p style={{ fontSize: 10, fontWeight: 800, color: "#dc2626" }}>Admin note</p>
              <p style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{p.kycRejectionNote}</p>
            </div>
          ) : null}
        </div>

        {/* Section group — Personal / Address / KYC / Bank.
            The rows are read-only on web (no edit screens exist yet) — show
            a subtitle summary and a chevron, but don't link anywhere. */}
        <MenuGroup>
          <MenuRow
            iconBg="#3b82f614"
            iconColor="#3b82f6"
            iconPath="M16 14c-1.5 0-3.5 1-4 2-.5 1 1 2 4 2s4.5-1 4-2c-.5-1-2.5-2-4-2zM12 12a4 4 0 100-8 4 4 0 000 8z"
            label="Personal info"
            sub={
              [p?.fatherName, p?.gender, p?.specialization].filter(Boolean).join(" · ") ||
              "Not filled"
            }
          />
          <Divider />
          <MenuRow
            iconBg="#16a34a14"
            iconColor="#16a34a"
            iconPath="M12 21s-7-7.5-7-12a7 7 0 1114 0c0 4.5-7 12-7 12zm0-10a2 2 0 100-4 2 2 0 000 4z"
            label="Address"
            sub={[p?.address, p?.city, p?.pincode].filter(Boolean).join(", ") || "Not filled"}
          />
          <Divider />
          <MenuRow
            iconBg="#FF2C2C14"
            iconColor="#FF2C2C"
            iconPath="M12 2l8 4v5c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V6l8-4z"
            label="KYC documents"
            sub={p?.aadhaarNumber || p?.panNumber ? "On file" : "Not submitted"}
            last
          />
        </MenuGroup>

        <MenuGroup>
          <MenuRow
            iconBg="#a855f714"
            iconColor="#a855f7"
            iconPath="M2 7h20v10H2zm0 4h20M6 15h2"
            label="Bank / payment"
            sub={p?.upiId || p?.bankName || "Not filled"}
            last
          />
        </MenuGroup>

        {/* Pending requests — only when there's something to look at. */}
        {pendingCount > 0 ? (
          <MenuGroup>
            <MenuRow
              iconBg="#f59e0b14"
              iconColor="#f59e0b"
              iconPath="M12 8v4l3 3M12 22a10 10 0 110-20 10 10 0 010 20z"
              label="Pending requests"
              badge={String(pendingCount)}
              last
            />
          </MenuGroup>
        ) : null}

        {/* Email — locked. Web UI is informational; editing requires admin. */}
        <MenuGroup>
          <MenuRow
            iconBg="#64748b14"
            iconColor="#64748b"
            iconPath="M4 6h16v12H4zM4 6l8 7 8-7"
            label="Email"
            sub={data.email}
            locked
            last
          />
        </MenuGroup>

        <MenuGroup>
          <MenuRow
            iconBg="#FF2C2C14"
            iconColor="#FF2C2C"
            iconPath="M12 11a4 4 0 100-8 4 4 0 000 8zM6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"
            label="Phone"
            sub={data.phone || "—"}
            last
          />
        </MenuGroup>

        <div style={{ marginTop: 4, marginBottom: 18 }}>
          <SignOutButton />
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "#bbb", fontWeight: 600, paddingBottom: 4 }}>
          Rayalaseema Express
        </p>
      </div>
    </ReporterShell>
  );
}

function MenuGroup({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        marginBottom: 14,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#eef0f3", marginLeft: 54 }} />;
}

function MenuRow({
  iconBg,
  iconColor,
  iconPath,
  label,
  sub,
  badge,
  locked,
  last,
}: {
  iconBg: string;
  iconColor: string;
  iconPath: string;
  label: string;
  sub?: string;
  badge?: string;
  locked?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        minHeight: 56,
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: iconBg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d={iconPath} />
        </svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>{label}</p>
        {sub ? (
          <p
            style={{
              fontSize: 12,
              color: "#999",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </p>
        ) : null}
      </div>
      {badge ? (
        <span
          style={{
            minWidth: 22,
            height: 22,
            padding: "0 6px",
            borderRadius: 11,
            background: "#FF2C2C",
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {badge}
        </span>
      ) : null}
      {locked ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c4c4c4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
      {/* `last` prop kept for API symmetry with the Expo MenuRow but unused
          here — dividers are sibling elements instead of an inset border. */}
      {void last}
    </div>
  );
}
