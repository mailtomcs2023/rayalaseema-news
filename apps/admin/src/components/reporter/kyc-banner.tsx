import { prisma } from "@rayalaseema/db";
import Link from "next/link";
import { AlertCircle, Hourglass, FileText, ArrowRight } from "lucide-react";

// Mirrors the Expo app's KycBanner. Server component - fetches fresh KYC
// status from the DB on every render (no AsyncStorage cache like the
// mobile app, since SSR re-runs per request). Renders nothing for
// VERIFIED reporters.
//
// Visual identity is intentionally identical to apps/reporter:
// PENDING → amber  /  SUBMITTED → blue (in progress)  /  REJECTED → red.

interface Props {
  userId: string;
}

type KycStatus = "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";

export async function KycBanner({ userId }: Props) {
  const profile = await prisma.reporterProfile.findUnique({
    where: { userId },
    select: { kycStatus: true, kycRejectionNote: true },
  });

  const status = (profile?.kycStatus as KycStatus | undefined) ?? "PENDING";
  const note = profile?.kycRejectionNote ?? null;
  if (status === "VERIFIED") return null;

  const ui = getUi(status);

  return (
    <div
      style={{
        backgroundColor: ui.bg,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Top row: icon chip + title block */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: ui.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <ui.Icon size={20} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25, color: ui.text }}>
            {ui.title}
          </p>
          <p style={{ fontSize: 13, color: "#4b5563", marginTop: 3, lineHeight: 1.45 }}>
            {ui.msg}
          </p>
        </div>
      </div>

      {/* 3-step progress: Account → Documents → Verification */}
      <div style={{ display: "flex", alignItems: "flex-start", padding: "4px 4px" }}>
        {(["Account", "Documents", "Verification"] as const).map((label, idx, arr) => {
          const isDone = idx < ui.step;
          const isCurrent = idx === ui.step;
          const dotBg = isDone || isCurrent ? ui.accent : "#fff";
          const dotBorder = isDone || isCurrent ? ui.accent : "#d1d5db";
          const labelColor = isDone || isCurrent ? ui.text : "#9ca3af";
          return (
            <div key={label} style={{ display: "contents" }}>
              <div style={{ alignItems: "center", width: 90, display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    border: `2px solid ${dotBorder}`,
                    backgroundColor: dotBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    boxShadow: isCurrent ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
                  }}
                >
                  {isDone ? "✓" : isCurrent ? <span style={{ width: 8, height: 8, borderRadius: 4, background: "#fff" }} /> : ""}
                </div>
                <p style={{ fontSize: 10, fontWeight: 700, marginTop: 6, textAlign: "center", color: labelColor }}>
                  {label}
                </p>
              </div>
              {idx < arr.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    marginTop: 10,
                    backgroundColor: idx < ui.step ? ui.accent : "#e5e7eb",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* SUBMITTED - ETA hint */}
      {ui.eta ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Hourglass size={13} color={ui.accent} />
          <p style={{ fontSize: 12, fontWeight: 700, color: ui.text }}>{ui.eta}</p>
        </div>
      ) : null}

      {/* REJECTED - admin's rejection note */}
      {status === "REJECTED" && note ? (
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            padding: 10,
            borderLeft: "3px solid #dc2626",
          }}
        >
          <p style={{ fontSize: 10, fontWeight: 800, color: "#7f1d1d", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Admin&apos;s note
          </p>
          <p style={{ fontSize: 13, color: "#7f1d1d", fontStyle: "italic", marginTop: 3, lineHeight: 1.45 }}>
            “{note}”
          </p>
        </div>
      ) : null}

      {/* CTA - only for actionable states */}
      {ui.cta ? (
        <Link
          href={ui.cta.href}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "12px 16px",
            borderRadius: 10,
            backgroundColor: ui.accent,
            color: "#fff",
            fontSize: 14,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          {ui.cta.label}
          <ArrowRight size={16} />
        </Link>
      ) : null}
    </div>
  );
}

function getUi(status: KycStatus) {
  switch (status) {
    case "REJECTED":
      return {
        bg: "#fff1f1",
        accent: "#dc2626",
        text: "#7f1d1d",
        Icon: AlertCircle,
        step: 1 as const,
        title: "Action required",
        msg: "Update your documents and re-submit.",
        cta: { label: "Re-submit documents", href: "/reporter/profile#kyc" },
      };
    case "SUBMITTED":
      return {
        bg: "#eef4ff",
        accent: "#2563eb",
        text: "#1e3a8a",
        Icon: Hourglass,
        step: 2 as const,
        title: "Verification in progress",
        msg: "Our team is reviewing your documents.",
        eta: "Usually verified within 24 hours",
        cta: undefined,
      };
    default:
      // PENDING (or anything unexpected)
      return {
        bg: "#fff7ed",
        accent: "#f59e0b",
        text: "#7c2d12",
        Icon: FileText,
        step: 1 as const,
        title: "Complete your KYC",
        msg: "Three simple steps to start publishing.",
        cta: { label: "Upload documents", href: "/reporter/profile#kyc" },
      };
  }
}
