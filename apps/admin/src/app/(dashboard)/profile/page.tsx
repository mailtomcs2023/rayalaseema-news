import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { decryptProfileFields } from "@/lib/crypto/kyc";
import { formatUserCode } from "@/lib/user-code";
import { UserCodeChip } from "@/components/user-code-chip";
import {
  ShieldCheck,
  Mail,
  Phone,
  Briefcase,
  User,
  Award,
  Tags,
  Share2,
  CheckCircle2,
  CircleX,
  ChevronRight,
  Lock,
  MapPin,
  FileCheck,
  Landmark,
} from "lucide-react";

// Profile page for ADMIN / EDITOR / SUB_EDITOR / USER.
// Mirrors the visual language AND row-per-section flow of /reporter/profile:
// hero card on top, then one MenuGroup per logical section with a single
// settings-style row showing { icon · label · summary subtitle · chevron }.
// Reporters are routed to /reporter/profile which has its own KYC / bank /
// address rows that don't apply here.

const ROLE_PILL: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  ADMIN:      { label: "Admin",       bg: "rgba(220,38,38,0.08)", text: "#dc2626" },
  EDITOR:     { label: "Editor",      bg: "rgba(37,99,235,0.08)",  text: "#1d4ed8" },
  SUB_EDITOR: { label: "Sub Editor",  bg: "rgba(180,83,9,0.08)",   text: "#92400e" },
  REPORTER:   { label: "Reporter",    bg: "rgba(22,101,52,0.08)",  text: "#166534" },
  USER:       { label: "User",        bg: "rgba(71,85,105,0.08)",  text: "#475569" },
};

const KYC_PILL: Record<string, { label: string; bg: string; text: string }> = {
  PENDING:   { label: "KYC pending",       bg: "#fef3c7", text: "#92400e" },
  SUBMITTED: { label: "KYC under review",  bg: "#dbeafe", text: "#1d4ed8" },
  VERIFIED:  { label: "KYC verified",      bg: "#dcfce7", text: "#166534" },
  REJECTED:  { label: "KYC rejected",      bg: "#fee2e2", text: "#dc2626" },
};

// Trim free-text into a single-line preview that fits a row subtitle.
function preview(text: string | null | undefined, max = 60): string | undefined {
  if (!text) return undefined;
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

// Format a list as "A, B, +N more" so long lists collapse cleanly.
function listSummary(items: string[], head = 2): string | undefined {
  const xs = items.filter(Boolean);
  if (xs.length === 0) return undefined;
  if (xs.length <= head) return xs.join(", ");
  return `${xs.slice(0, head).join(", ")}, +${xs.length - head} more`;
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id as string | undefined;
  const role = (session.user as any).role as string | undefined;
  if (!userId) redirect("/login");
  if (role === "REPORTER") redirect("/reporter/profile");

  const data = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      avatar: true,
      bio: true,
      role: true,
      active: true,
      userCode: true,
      createdAt: true,
      twitterHandle: true,
      linkedinUrl: true,
      facebookUrl: true,
      expertise: true,
      yearsExperience: true,
      assignedCategories: {
        select: { category: { select: { id: true, nameEn: true } } },
      },
      reporterProfile: {
        select: {
          fatherName: true,
          dateOfBirth: true,
          gender: true,
          specialization: true,
          address: true,
          city: true,
          pincode: true,
          primaryDistrict: true,
          aadhaarNumber: true,
          panNumber: true,
          aadhaarFrontUrl: true,
          aadhaarBackUrl: true,
          panCardUrl: true,
          photoUrl: true,
          kycStatus: true,
          upiId: true,
          bankName: true,
          bankAccount: true,
          bankIfsc: true,
        },
      },
      _count: { select: { contents: true } },
    },
  });
  if (!data) redirect("/login");
  const rp = decryptProfileFields(data.reporterProfile);

  const pill = ROLE_PILL[data.role] ?? ROLE_PILL.USER;
  const initials = (data.name || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const memberSince = new Date(data.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
  const expertise = (data.expertise ?? []).filter(Boolean);
  const assigned = data.assignedCategories.map((a) => a.category);

  // Subtitle summaries - these mirror the reporter pattern: each row shows
  // either a one-line preview of what's filled OR "Not filled" so the user
  // can see at a glance what's missing.
  //
  // Personal subtitle prefers concrete facts (father / gender / specialization)
  // because those are what the staff just filled in via the onboarding wizard;
  // free-text bio falls back if none are set.
  const personalFacts = [rp?.fatherName, rp?.gender, rp?.specialization]
    .filter(Boolean) as string[];
  const personalSub =
    listSummary(personalFacts) ?? preview(data.bio) ?? "Not filled";
  const addressSub =
    [rp?.address, rp?.city, rp?.pincode].filter(Boolean).join(", ") ||
    "Not filled";
  const kycSub = (() => {
    if (!rp) return "Not submitted";
    const parts: string[] = [];
    if (rp.aadhaarNumber) parts.push("Aadhaar");
    if (rp.panNumber) parts.push("PAN");
    if (rp.photoUrl) parts.push("Photo");
    if (parts.length === 0) return "Not submitted";
    return parts.join(" · ");
  })();
  const bankSub = (() => {
    if (!rp) return "Not filled";
    if (rp.upiId) return rp.upiId;
    if (rp.bankName)
      return rp.bankAccount
        ? `${rp.bankName} · ${"•".repeat(Math.max(0, rp.bankAccount.length - 4))}${rp.bankAccount.slice(-4)}`
        : rp.bankName;
    return "Not filled";
  })();
  const kycStatus = (rp?.kycStatus ?? "PENDING") as keyof typeof KYC_PILL;
  const kycPill = KYC_PILL[kycStatus];
  const editorialSub =
    [
      data.yearsExperience ? `${data.yearsExperience} years experience` : null,
      `${data._count.contents.toLocaleString()} articles`,
    ]
      .filter(Boolean)
      .join(" · ");
  const expertiseSub = listSummary(expertise) ?? "Not added";
  const assignedSub =
    assigned.length === 0
      ? "None assigned"
      : listSummary(assigned.map((c) => c.nameEn).filter((n): n is string => !!n)) ?? "None assigned";
  const socialPlatforms = [
    data.twitterHandle ? "Twitter" : null,
    data.linkedinUrl ? "LinkedIn" : null,
    data.facebookUrl ? "Facebook" : null,
  ].filter(Boolean) as string[];
  const socialSub = socialPlatforms.length === 0 ? "Not linked" : socialPlatforms.join(", ");

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main
        style={{
          marginLeft: 240,
          flex: 1,
          padding: "24px 20px 40px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {/* Inner column constrains the readable width to 720px while the
            outer <main> stretches across the rest of the viewport - that
            way `justifyContent: center` puts the card stack in the
            middle of the area to the right of the fixed sidebar instead
            of pinning it to the left edge. */}
        <div style={{ width: "100%", maxWidth: 720 }}>
        {/* Centered hero card - large avatar + name + role/active pills */}
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
            {data.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.avatar}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              initials || "?"
            )}
          </div>
          <p
            style={{
              fontSize: 20,
              lineHeight: "26px",
              fontWeight: 800,
              color: "#111",
              textAlign: "center",
            }}
          >
            {data.name || "-"}
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
                background: pill.bg,
                color: pill.text,
                padding: "5px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <ShieldCheck size={12} />
              {pill.label}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: data.active ? "#dcfce7" : "#fee2e2",
                color: data.active ? "#166534" : "#991b1b",
                padding: "5px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {data.active ? <CheckCircle2 size={12} /> : <CircleX size={12} />}
              {data.active ? "Active" : "Inactive"}
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
          {data.userCode ? (
            <UserCodeChip code={formatUserCode(data.userCode)} raw={data.userCode} />
          ) : null}
          <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
            Member since {memberSince}
          </p>
        </div>

        {/* Personal info - bio / father / gender / specialization summary */}
        <MenuGroup>
          <MenuRow
            href="/profile/personal"
            iconBg="#3b82f614"
            iconColor="#3b82f6"
            icon={<User size={14} />}
            label="Personal info"
            sub={personalSub}
          />
        </MenuGroup>

        {/* Address (lives on ReporterProfile, same row the reporter has) */}
        <MenuGroup>
          <MenuRow
            href="/profile/address"
            iconBg="#0ea5e914"
            iconColor="#0ea5e9"
            icon={<MapPin size={14} />}
            label="Address"
            sub={addressSub}
          />
        </MenuGroup>

        {/* KYC documents - Aadhaar / PAN / photo / docs */}
        <MenuGroup>
          <MenuRow
            href="/profile/kyc"
            iconBg="#ef444414"
            iconColor="#ef4444"
            icon={<FileCheck size={14} />}
            label="KYC documents"
            sub={kycSub}
          />
        </MenuGroup>

        {/* Bank / payment */}
        <MenuGroup>
          <MenuRow
            href="/profile/bank"
            iconBg="#10b98114"
            iconColor="#10b981"
            icon={<Landmark size={14} />}
            label="Bank / payment"
            sub={bankSub}
          />
        </MenuGroup>

        {/* Editorial - years exp + articles count */}
        <MenuGroup>
          <MenuRow
            href="/profile/editorial"
            iconBg="#16a34a14"
            iconColor="#16a34a"
            icon={<Briefcase size={14} />}
            label="Editorial"
            sub={editorialSub}
          />
        </MenuGroup>

        {/* Expertise */}
        <MenuGroup>
          <MenuRow
            href="/profile/expertise"
            iconBg="#f59e0b14"
            iconColor="#f59e0b"
            icon={<Award size={14} />}
            label="Expertise"
            sub={expertiseSub}
          />
        </MenuGroup>

        {/* Assigned categories */}
        <MenuGroup>
          <MenuRow
            href="/profile/categories"
            iconBg="#FF2C2C14"
            iconColor="#FF2C2C"
            icon={<Tags size={14} />}
            label="Assigned categories"
            sub={assignedSub}
            badge={assigned.length > 0 ? String(assigned.length) : undefined}
          />
        </MenuGroup>

        {/* Social */}
        <MenuGroup>
          <MenuRow
            href="/profile/social"
            iconBg="#a855f714"
            iconColor="#a855f7"
            icon={<Share2 size={14} />}
            label="Social profiles"
            sub={socialSub}
          />
        </MenuGroup>

        {/* Email - locked (admin-managed) */}
        <MenuGroup>
          <MenuRow
            iconBg="#64748b14"
            iconColor="#64748b"
            icon={<Mail size={14} />}
            label="Email"
            sub={data.email}
            locked
          />
        </MenuGroup>

        {/* Phone */}
        <MenuGroup>
          <MenuRow
            href="/profile/phone"
            iconBg="#FF2C2C14"
            iconColor="#FF2C2C"
            icon={<Phone size={14} />}
            label="Phone"
            sub={data.phone || "-"}
          />
        </MenuGroup>

        <p
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#bbb",
            fontWeight: 600,
            paddingTop: 8,
          }}
        >
          Rayalaseema News
        </p>
        </div>
      </main>
    </div>
  );
}

// ─── presentational helpers (mirror /reporter/profile) ───────────────────

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

function MenuRow({
  href,
  iconBg,
  iconColor,
  icon,
  label,
  sub,
  badge,
  locked,
}: {
  href?: string;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  badge?: string;
  locked?: boolean;
}) {
  const body = (
    <>
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: iconBg,
          color: iconColor,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
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
        <Lock size={14} style={{ color: "#bbb", flexShrink: 0 }} />
      ) : (
        <ChevronRight size={18} style={{ color: "#c4c4c4", flexShrink: 0 }} />
      )}
    </>
  );

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    minHeight: 56,
    color: "inherit",
    textDecoration: "none",
  };

  if (href) {
    return (
      <Link href={href} style={rowStyle}>
        {body}
      </Link>
    );
  }
  return <div style={rowStyle}>{body}</div>;
}
