"use client";

// Client half of the KYC nag banner. The server component
// (admin-kyc-banner.tsx) decides whether to render at all (status +
// dismissal cookie) and hands the resolved status down; this part owns the
// presentation and the dismiss (✕) interaction.
//
// Dismissal model: clicking ✕ writes a `kyc_banner_dismissed=<status>`
// cookie (30 days) and hides the bar immediately. The cookie is keyed by
// the CURRENT status, so a status change (PENDING → REJECTED, etc.) has a
// different key and re-surfaces the banner - dismissing "complete your KYC"
// doesn't also silence a later "action required" rejection notice.

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, FileText, Hourglass, ArrowRight, X } from "lucide-react";

type KycStatus = "PENDING" | "SUBMITTED" | "REJECTED";

export function KycBannerClient({
  status,
  rejectionNote,
}: {
  status: KycStatus;
  rejectionNote: string | null;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const ui =
    status === "REJECTED"
      ? {
          bg: "bg-red-50",
          border: "border-red-200",
          dot: "bg-red-500",
          text: "text-red-800",
          Icon: AlertCircle,
          title: "KYC rejected - action required",
          cta: "Re-submit documents",
        }
      : status === "SUBMITTED"
      ? {
          bg: "bg-blue-50",
          border: "border-blue-200",
          dot: "bg-blue-500",
          text: "text-blue-800",
          Icon: Hourglass,
          title: "Documents submitted - under review (usually verified within 24 hours)",
          cta: "Re-submit",
        }
      : {
          bg: "bg-amber-50",
          border: "border-amber-200",
          dot: "bg-amber-500",
          text: "text-amber-800",
          Icon: FileText,
          title: "Complete your KYC to enable publishing and payouts",
          cta: "Upload documents",
        };

  const dismiss = () => {
    // Hide right away; persist so it stays gone on reload until the status
    // changes. 30 days mirrors the kyc_nudge_seen suppression window.
    document.cookie = `kyc_banner_dismissed=${status}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    setHidden(true);
  };

  return (
    <div
      className="shadcn-scope"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        marginLeft: 240,
        padding: "0 24px 16px",
        zIndex: 50,
      }}
    >
      <div
        role="status"
        className={`flex items-center gap-3 rounded-xl border ${ui.bg} ${ui.border} px-4 py-3 shadow-lg`}
      >
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ui.dot}`}>
          <ui.Icon size={18} className="text-white" />
        </span>
        <div className={`flex-1 min-w-0 ${ui.text}`}>
          <p className="text-sm font-semibold leading-tight">{ui.title}</p>
          {status === "REJECTED" && rejectionNote && (
            <p className="mt-1 truncate text-xs italic opacity-90" title={rejectionNote}>
              &ldquo;{rejectionNote}&rdquo;
            </p>
          )}
        </div>
        <Link
          href="/onboarding/kyc"
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md ${ui.dot} px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90`}
        >
          {ui.cta}
          <ArrowRight size={13} />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className={`inline-flex shrink-0 items-center justify-center rounded-md p-1.5 ${ui.text} hover:bg-black/5`}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
