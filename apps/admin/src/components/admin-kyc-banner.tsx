// Card-style banner rendered on every (dashboard) page until the signed-in
// staff member's KYC reaches VERIFIED. Server component - reads fresh
// status from the DB on every nav so a freshly-verified user sees the
// banner disappear immediately.
//
// Pinned full-width to the BOTTOM of the viewport (fixed positioning,
// z-50), offset by the 240px sidebar on the left so it aligns with the
// page content gutter. Same shape as the original top banner - just
// inverted to the bottom so it stops pushing the page heading down.
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

  // Full-width bottom variant - fixed strip pinned to the viewport floor,
  // offset on the left by the sidebar (240px) so it lines up with the
  // page content gutter. Same rounded card chrome as before; shadow now
  // points UP (-y) since the elevation source is below the page.
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
      </div>
    </div>
  );
}
