// Card-style banner rendered on every (dashboard) page until the signed-in
// staff member's KYC reaches VERIFIED. Server component - reads fresh
// status from the DB on every nav so a freshly-verified user sees the
// banner disappear immediately.
//
// Floats at the BOTTOM-RIGHT of the viewport (fixed positioning, z-50) so
// it nudges without displacing the page heading or the first row of
// content. Spans full width on mobile (with a 16px margin), caps at ~440px
// on >= sm so it doesn't dominate the desk on a laptop.
//
// Status palette:
//   PENDING    → amber, "Complete your KYC"
//   SUBMITTED  → blue,  "Documents submitted - under review"
//   REJECTED   → red,   "Action required" + rejection note
//   VERIFIED   → no banner (null)
//
// Missing profile row → treated as PENDING. This keeps the banner in sync
// with the client-side toast (useKycGate), which blocks any non-VERIFIED
// kycStatus. Without this, legacy seeded staff with no profile would see
// the toast fire on every gated action but no banner explaining why -
// confusing UX. The KYC page handles the create-or-update flow.

import { prisma } from "@rayalaseema/db";
import Link from "next/link";
import { AlertCircle, FileText, Hourglass, ArrowRight } from "lucide-react";

type KycStatus = "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";

export async function AdminKycBanner({ userId }: { userId: string }) {
  const profile = await prisma.reporterProfile.findUnique({
    where: { userId },
    select: { kycStatus: true, kycRejectionNote: true },
  });

  const status: KycStatus = (profile?.kycStatus as KycStatus) ?? "PENDING";
  if (status === "VERIFIED") return null;
  const rejectionNote = profile?.kycRejectionNote ?? null;

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

  // Floating variant - fixed bottom-right, capped at ~440px wide on
  // desktop, full-bleed (with 16px gutters) on mobile. Strong shadow +
  // tinted border so it reads as a persistent nudge floating above the
  // page content rather than part of the page itself.
  return (
    <div className="shadcn-scope fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-md">
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
      </div>
    </div>
  );
}
