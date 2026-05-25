import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { ReporterShell } from "@/components/reporter/reporter-shell";
import { KycBanner } from "@/components/reporter/kyc-banner";
import { SignOutButton } from "@/components/reporter/sign-out-button";
import {
  User,
  MapPin,
  ShieldCheck,
  Wallet,
  Mail,
  Phone,
  IdCard,
} from "lucide-react";

// Reporter Profile — mirrors the Expo ProfileScreen.
// Account info card • KYC status • profile sections (read-only for web,
// edit via mobile app) • Sign Out.

const KYC_LABEL: Record<string, { label: string; bg: string; text: string }> = {
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
      journalistProfile: true,
    },
  });
  if (!data) redirect("/login");

  const p = data.journalistProfile;
  const kyc = p?.kycStatus ? KYC_LABEL[p.kycStatus] : KYC_LABEL.PENDING;
  const initials = (data.name || "R")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ReporterShell>
      <div style={{ paddingTop: 16 }}>
        <KycBanner userId={userId} />

        {/* Account card */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#FF2C2C",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 900,
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {data.avatar ? (
                <img src={data.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                initials
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: "#111" }}>{data.name}</p>
              <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>REPORTER</p>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: kyc.text,
                backgroundColor: kyc.bg,
                padding: "5px 10px",
                borderRadius: 999,
                whiteSpace: "nowrap",
              }}
            >
              {kyc.label}
            </span>
          </div>

          {/* Contact rows */}
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <ContactRow Icon={Mail} label="Email" value={data.email} />
            <ContactRow Icon={Phone} label="Phone" value={data.phone || "—"} />
            {p?.primaryDistrict ? (
              <ContactRow Icon={MapPin} label="District" value={p.primaryDistrict} />
            ) : null}
          </div>
        </div>

        {/* Section cards: Personal / Address / KYC / Bank — display only */}
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111", marginBottom: 12, marginTop: 8 }}>
          Profile sections
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
          <SectionCard
            Icon={User}
            tint="#3b82f6"
            title="Personal info"
            subtitle={
              [p?.fatherName, p?.gender, p?.specialization].filter(Boolean).join(" · ") ||
              "Not yet filled"
            }
          />
          <SectionCard
            Icon={MapPin}
            tint="#16a34a"
            title="Address"
            subtitle={
              [p?.address, p?.city, p?.pincode].filter(Boolean).join(", ") || "Not yet filled"
            }
          />
          <SectionCard
            Icon={ShieldCheck}
            tint="#FF2C2C"
            title="KYC documents"
            subtitle={
              p?.aadhaarNumber || p?.panNumber
                ? "On file"
                : "Not yet submitted"
            }
          />
          <SectionCard
            Icon={Wallet}
            tint="#a855f7"
            title="Bank / payment"
            subtitle={p?.upiId || p?.bankName || "Not yet filled"}
          />
        </div>

        <p style={{ fontSize: 12, color: "#888", textAlign: "center", marginBottom: 18 }}>
          To edit your profile or upload KYC documents, please use the mobile app.
        </p>

        <SignOutButton />
      </div>
    </ReporterShell>
  );
}

function ContactRow({
  Icon,
  label,
  value,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Icon size={14} color="#9ca3af" />
      <p style={{ fontSize: 12, color: "#888", fontWeight: 600, width: 80 }}>{label}</p>
      <p style={{ flex: 1, fontSize: 13, color: "#111" }}>{value}</p>
    </div>
  );
}

function SectionCard({
  Icon,
  tint,
  title,
  subtitle,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  tint: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: 14,
        padding: 14,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: tint + "1A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={18} color={tint} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{title}</p>
        <p
          style={{
            fontSize: 12,
            color: "#888",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
