"use client";

// Client-side KYC gates for editorial action triggers.
//
// Two shapes for the same rule:
//   - <KycGatedLink>   wraps a navigation CTA (link / button-in-link)
//   - useKycGate()     returns a guard you call from any onClick before
//                      the action runs (modal opens, fetch fires, etc.)
//
// Rules (identical across both):
//   - ADMIN                          → action runs
//   - role + kycStatus === VERIFIED  → action runs
//   - otherwise                      → action is suppressed, a red toast
//                                       fires with a "Complete KYC" CTA
//
// The session callback already exposes `kycStatus` on session.user, so
// the check is a single in-memory read - no fetch, no flicker.
//
// This complements the server-side `requireKyc` guard (the authority).
// The server still rejects un-gated callers with 403 + kycRequired:true,
// which the receiving page also surfaces as a toast - so a determined
// curl user can't bypass anything. The client gate is just so the editor
// gets instant feedback instead of walking into the action and being
// bounced.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useCallback } from "react";
import type { CSSProperties, ReactNode } from "react";

function showBlockedToast(
  action: string,
  kycStatus: string | undefined,
  router: ReturnType<typeof useRouter>,
) {
  toast.error(`Your KYC must be verified to ${action}.`, {
    description:
      kycStatus === "SUBMITTED"
        ? "Documents are under review - usually verified within 24 hours."
        : kycStatus === "REJECTED"
          ? "Your last submission was rejected. Re-upload from the KYC page."
          : "Upload your documents from the KYC page to unlock editorial actions.",
    action: { label: "Complete KYC", onClick: () => router.push("/onboarding/kyc") },
    duration: 8000,
  });
}

/**
 * Hook variant - returns `{ blocked, guard }`. `guard(action)` returns a
 * function: call it instead of the original handler. If KYC is fine the
 * original handler runs; otherwise the toast fires and the handler is
 * skipped.
 *
 *   const { guard } = useKycGate();
 *   <Button onClick={guard("fetch articles", () => setModalOpen(true))} />
 */
export function useKycGate() {
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const kycStatus = (session?.user as any)?.kycStatus as string | undefined;
  const blocked = role !== "ADMIN" && kycStatus !== "VERIFIED";

  const guard = useCallback(
    <Args extends unknown[]>(action: string, fn?: (...args: Args) => void) =>
      (...args: Args) => {
        if (blocked) {
          showBlockedToast(action, kycStatus, router);
          return;
        }
        fn?.(...args);
      },
    [blocked, kycStatus, router],
  );

  return { blocked, guard, kycStatus, role };
}

export function KycGatedLink({
  href,
  children,
  className,
  style,
  action = "create articles",
}: {
  href: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Short verb used in the toast message ("create articles", "publish", etc.). */
  action?: string;
}) {
  const router = useRouter();
  const { blocked, kycStatus } = useKycGate();

  if (!blocked) {
    return (
      <Link href={href} className={className} style={style}>
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      className={className}
      style={style}
      onClick={(e) => {
        e.preventDefault();
        showBlockedToast(action, kycStatus, router);
      }}
    >
      {children}
    </a>
  );
}
