"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Home, FileText, Wallet, User, Plus } from "lucide-react";
import { ReactNode } from "react";
import { toast } from "sonner";

type KycStatus = "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";

// Web mirror of the Expo reporter app's chrome: red rounded header with the
// inverse logo on top, four-tab nav strip at the bottom (and as a side rail on
// desktop). The reporter never sees the admin sidebar - only their own four
// surfaces: Home, My Articles, Earnings, Profile.
//
// The FAB is always visible on Home + Articles. Tap behaviour depends on
// `kycStatus`:
//   - VERIFIED   → navigate straight to /reporter/articles/new
//   - PENDING    → red toast "Upload your KYC documents first" + Upload action
//   - SUBMITTED  → blue/info toast "KYC awaiting admin approval"
//   - REJECTED   → red toast with the rejection note + Re-upload action
// This way the FAB is always discoverable but un-verified reporters get a
// clear, contextual reason instead of a silently missing button.
export function ReporterShell({
  children,
  kycStatus = "VERIFIED",
}: {
  children: ReactNode;
  kycStatus?: KycStatus;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const onFabClick = (e: React.MouseEvent) => {
    if (kycStatus === "VERIFIED") return; // let the Link navigate
    e.preventDefault();
    if (kycStatus === "SUBMITTED") {
      toast.info("KYC awaiting admin approval", {
        description: "You can start writing articles once your documents are verified - usually within 24 hours.",
      });
      return;
    }
    if (kycStatus === "REJECTED") {
      toast.error("KYC was rejected", {
        description: "Please re-upload the documents flagged by the admin.",
        action: {
          label: "Re-upload",
          onClick: () => router.push("/reporter/profile#kyc"),
        },
      });
      return;
    }
    // PENDING (or anything unexpected)
    toast.error("Upload your KYC documents first", {
      description: "We need your identity verified before you can start writing articles.",
      action: {
        label: "Upload now",
        onClick: () => router.push("/reporter/profile#kyc"),
      },
    });
  };

  const tabs = [
    { href: "/reporter", label: "Home", icon: Home },
    { href: "/reporter/articles", label: "Articles", icon: FileText },
    { href: "/reporter/earnings", label: "Earnings", icon: Wallet },
    { href: "/reporter/profile", label: "Profile", icon: User },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", flexDirection: "column" }}>
      {/* Brand header - bottom-rounded red banner matching ScreenHeader in Expo.
          Sticky so it stays pinned while the page scrolls underneath, the way
          the native Expo header does. */}
      <header
        style={{
          background: "#FF2C2C",
          padding: "18px 20px",
          borderBottomLeftRadius: 20,
          borderBottomRightRadius: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <img src="/logo-inverse.svg" alt="Rayalaseema Express" style={{ height: 32, display: "block" }} />
      </header>

      {/* Page body - leaves room for the fixed bottom tab bar. Pages own
          their own top padding so layout matches the Expo `paddingTop`
          values exactly. Headings inside reset their browser-default top/
          bottom margins (see the global rule in the <style> block below). */}
      <main
        className="reporter-main"
        style={{
          flex: 1,
          // 14px horizontal padding mirrors Expo's `marginHorizontal: 14`.
          // Each page lays out its children inside this gutter so cards,
          // headings, and chips all align on the same vertical line.
          paddingLeft: 14,
          paddingRight: 14,
          // Tab bar (~56) + FAB clearance (~80 to bottom) - keep the last
          // article card from being hidden behind the floating "+" button.
          paddingBottom: 140,
          maxWidth: 960,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        {children}
      </main>

      {/* Floating "new article" button - shown on Home + Articles. Hidden on
          Earnings, Profile, and the editor itself. For un-verified reporters
          the FAB stays visible but the click is intercepted and a contextual
          toast explains the KYC state. */}
      {(pathname === "/reporter" || pathname === "/reporter/articles") && (
        <Link
          href="/reporter/articles/new"
          aria-label="New article"
          className="reporter-fab"
          onClick={onFabClick}
        >
          <Plus size={26} />
        </Link>
      )}

      {/* Bottom tab bar - fixed to the viewport, matching the native tab bar */}
      <nav className="reporter-tabs">
        {tabs.map((t) => {
          // Home is active only on exact /reporter; deeper tabs match either
          // the tab path or any nested path under it.
          const active = t.href === "/reporter"
            ? pathname === "/reporter"
            : pathname === t.href || pathname.startsWith(t.href + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "8px 4px",
                textDecoration: "none",
                color: active ? "#FF2C2C" : "#6b7280",
                fontWeight: 700,
                fontSize: 11,
              }}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              <span>{t.label}</span>
            </Link>
          );
        })}
      </nav>

      <style>{`
        /* Reset browser-default vertical margins on headings/paragraphs
           inside the reporter portal so inline padding controls spacing
           exactly the way the Expo screens do. */
        .reporter-main h1,
        .reporter-main h2,
        .reporter-main h3,
        .reporter-main p { margin: 0; }
        /* globals.css adds padding-top: 72px to every <main> under 1024px
           to clear the admin's mobile top-bar. The reporter shell has its
           own sticky header, so neutralise that rule here. The override is
           scoped to the same media query so on desktop the inline
           margin:0 auto keeps centring the 960px content column. */
        @media (max-width: 1024px) {
          main.reporter-main { padding-top: 0 !important; }
        }
        .reporter-tabs {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          background: #fff;
          border-top: 1px solid #e5e7eb;
          display: flex;
          align-items: stretch;
          padding-bottom: env(safe-area-inset-bottom, 0);
          z-index: 50;
        }
        .reporter-fab {
          position: fixed;
          /* Track the right edge of the centred 960px content column rather
             than the viewport. On phones (viewport <= 960) this collapses to
             the standard 16px gutter; on desktop the FAB sits next to the
             cards instead of floating off in empty white space. */
          right: max(16px, calc((100vw - 960px) / 2 + 16px));
          bottom: calc(80px + env(safe-area-inset-bottom, 0));
          width: 56px;
          height: 56px;
          border-radius: 28px;
          background: #FF2C2C;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 6px 16px rgba(255, 44, 44, 0.4);
          z-index: 51;
          text-decoration: none;
          transition: transform 0.15s ease;
        }
        .reporter-fab:hover { transform: scale(1.05); }
        .reporter-fab:active { transform: scale(0.95); }
      `}</style>
    </div>
  );
}
