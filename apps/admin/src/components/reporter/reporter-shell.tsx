"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, Wallet, User, Plus } from "lucide-react";
import { ReactNode } from "react";

// Web mirror of the Expo reporter app's chrome: red rounded header with the
// inverse logo on top, four-tab nav strip at the bottom (and as a side rail on
// desktop). The reporter never sees the admin sidebar — only their own four
// surfaces: Home, My Articles, Earnings, Profile.
export function ReporterShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { href: "/reporter", label: "Home", icon: Home },
    { href: "/reporter/articles", label: "Articles", icon: FileText },
    { href: "/reporter/earnings", label: "Earnings", icon: Wallet },
    { href: "/reporter/profile", label: "Profile", icon: User },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", flexDirection: "column" }}>
      {/* Brand header — bottom-rounded red banner matching ScreenHeader in Expo */}
      <header
        style={{
          background: "#FF2C2C",
          padding: "18px 20px",
          borderBottomLeftRadius: 20,
          borderBottomRightRadius: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <img src="/logo-inverse.svg" alt="Rayalaseema Express" style={{ height: 32, display: "block" }} />
      </header>

      {/* Page body — leaves room for the fixed bottom tab bar on mobile and the
          side rail on desktop. */}
      <main
        className="reporter-main"
        style={{
          flex: 1,
          paddingBottom: 88,
          paddingTop: 8,
          maxWidth: 960,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        {children}
      </main>

      {/* Floating "new article" button — mirrors the FAB on the Expo
          Dashboard/Articles screens. Hidden on the editor itself to avoid a
          self-link. */}
      {pathname !== "/reporter/articles/new" && (
        <Link
          href="/reporter/articles/new"
          aria-label="New article"
          className="reporter-fab"
        >
          <Plus size={26} />
        </Link>
      )}

      {/* Bottom tab bar — fixed to the viewport, matching the native tab bar */}
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
          right: 20px;
          bottom: calc(76px + env(safe-area-inset-bottom, 0));
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
