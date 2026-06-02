// Shared layout for every /admin page in the (dashboard) route group.
// Renders:
//   1. The fixed Sidebar - hoisted here from each page so it doesn't
//      re-mount on every navigation. Previously each page imported its
//      own <Sidebar />, which lived inside the page's client-component
//      Suspense boundary; on refresh / soft-nav the sidebar blanked out
//      until the heavy editor chunks (react-grid-layout etc.) finished
//      hydrating. Hoisting it makes the sidebar part of the layout's
//      SSR'd shell, so it persists across navigations and never blinks.
//   2. The KYC nag banner - follows the user wherever they navigate
//      until they hit VERIFIED. Offsets itself by the sidebar width
//      (marginLeft: 240) so it doesn't overlap the fixed sidebar - same
//      trick the per-page <main> elements use.

import { Suspense } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { AdminKycBanner } from "@/components/admin-kyc-banner";
import { KycSessionRefresher } from "@/components/kyc-session-refresher";
import { Sidebar } from "@/components/sidebar";
import type { Role } from "@/lib/roles";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  // Server-resolved role passed into <Sidebar> so the nav can render its
  // role-filtered items during SSR. Without this, the client-side
  // useSession() probe takes a beat to resolve and the nav renders empty
  // → then populates → then scroll-restores, which the user sees as a
  // visible jump on every refresh.
  const initialRole = ((session?.user as any)?.role as Role | undefined) ?? undefined;

  // Suppress the banner on screens that already render their own KYC UI:
  //   - /onboarding/*  - the full onboarding form (admin staff)
  //   - /reporter/*    - the reporter portal has its own big KYC card
  //                      with the 3-step progress (Account → Documents →
  //                      Verification). Doubling them up looks broken.
  // Next 16 exposes the current pathname via the `x-pathname` header set
  // by middleware/proxy; fall back to a string match for safety.
  const h = await headers();
  const pathname = h.get("x-pathname") || h.get("x-invoke-path") || "";
  const suppressBanner =
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/reporter") ||
    // Forced password change has the floor - KYC nudge would just be noise
    // on top of "you can't navigate elsewhere until you set a password".
    pathname === "/change-password";

  // Reporter portal has its own chrome (ReporterShell: red header + bottom
  // tab bar). The admin sidebar would just sit behind it as dead space -
  // and worse, a REPORTER has nothing to click in the admin nav anyway.
  // Same suppression for /change-password where the user is locked to a
  // single screen.
  const suppressSidebar =
    pathname.startsWith("/reporter") || pathname === "/change-password";

  // ADMINs are exempt from KYC server-side (see lib/kyc-guard.ts) - they
  // can publish without verification, so nagging them with a banner that
  // says "Complete your KYC to enable publishing" is factually wrong.
  // Editors + sub-editors still see the banner because publish APIs gate
  // them on VERIFIED.
  const suppressKycForRole = initialRole === "ADMIN";

  return (
    <>
      {/* Re-reads kycStatus from the DB into the JWT so a user verified by
          an admin sees the gate clear without logging out. Self-gates to
          non-verified non-admins; inert otherwise. */}
      <KycSessionRefresher />
      {!suppressSidebar && <Sidebar initialRole={initialRole} />}
      {/* The KYC banner does its own prisma.findUnique on every render,
          which used to block the WHOLE layout from streaming on every
          soft-nav between dashboard pages - that delay is what made the
          page swap look like a flash. Wrapping it in <Suspense> lets the
          rest of the layout (sidebar + children) stream immediately;
          the banner pops in once the query resolves (~10–30ms). */}
      {userId && !suppressBanner && !suppressKycForRole && (
        <Suspense fallback={null}>
          <AdminKycBanner userId={userId} />
        </Suspense>
      )}
      {children}
    </>
  );
}
