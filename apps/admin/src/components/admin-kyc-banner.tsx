// Card-style banner rendered above every (dashboard) page until the
// signed-in staff member's KYC reaches VERIFIED. Server component - reads
// fresh status from the DB on every nav so a freshly-verified admin sees
// the banner disappear immediately.
//
// Sits INSIDE the page content gutter (offset by the 240px sidebar, padded
// from the edges) so it reads as a contextual notification card rather
// than a flush top-of-window strip.
//
// Status palette:
//   PENDING    → amber, "Complete your KYC"
//   SUBMITTED  → blue,  "Documents submitted - under review"
//   REJECTED   → red,   "Action required" + rejection note
//   VERIFIED   → no banner (null)
//
// USER role + accounts without a profile row (legacy seeds, pre-merge
// data) also render no banner - KYC only applies to staff.

import { prisma } from "@rayalaseema/db";
import Link from "next/link";
import { AlertCircle, FileText, Hourglass, ArrowRight } from "lucide-react";

type KycStatus = "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";

export async function AdminKycBanner({ userId }: { userId: string }) {
  // findUnique - every staff account auto-creates one of these via
  // /api/users POST (PR earlier this session). Older seeded accounts
  // may still be missing one; we treat that case as "no profile, no
  // banner" rather than blocking them.
  const profile = await prisma.reporterProfile.findUnique({
    where: { userId },
    select: { kycStatus: true, kycRejectionNote: true },
  });
  if (!profile) return null;

  const status = profile.kycStatus as KycStatus;
  if (status === "VERIFIED") return null;

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

  // Card variant - sits inside the page gutter (sidebar offset + 24px
  // padding mirror the per-page <main> values used across the dashboard
  // so the card lines up with the page heading below). Rounded corners +
  // shadow + 1px tinted border make it read as a notification card
  // instead of a navbar strip.
  return (
    <div
      className="shadcn-scope"
      style={{ marginLeft: 240, padding: "16px 24px 0" }}
    >
      <div
        role="status"
        className={`flex items-center gap-3 rounded-xl border ${ui.bg} ${ui.border} px-4 py-3 shadow-sm`}
      >
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ui.dot}`}>
          <ui.Icon size={18} className="text-white" />
        </span>
        <div className={`flex-1 min-w-0 ${ui.text}`}>
          <p className="text-sm font-semibold leading-tight">{ui.title}</p>
          {status === "REJECTED" && profile.kycRejectionNote && (
            <p className="mt-1 truncate text-xs italic opacity-90" title={profile.kycRejectionNote}>
              &ldquo;{profile.kycRejectionNote}&rdquo;
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
      </div>
    </div>
  );
}
