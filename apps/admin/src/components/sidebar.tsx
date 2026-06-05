"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/roles";

// Stable id on the <nav> so the inline auto-scroll script below can find
// it without depending on a class. The script runs while the HTML is
// still being parsed, before first paint, so a hard refresh on /users
// (or any deep nav item) lands with the active row already centred -
// no scrollTop=0 paint followed by a late jump.
const SIDEBAR_NAV_ID = "admin-sidebar-nav";

// Each nav item declares which roles can see it. The set is the same as
// canVisit() in lib/roles.ts - if a route is blocked there, it's hidden
// here too so a user never sees a link that 403s when clicked.
//
//   ADMIN       - everything
//   EDITOR      - full editorial surface (Content, Review, ePaper, polls,
//                 comments, mandi, profile-requests, audit log) but blocked
//                 from HR / finance / settings / categories / desks / ads /
//                 ePaper Templates
//   SUB_EDITOR  - review-focused only: Dashboard, Content, Review Queue
//   REPORTER    - never sees this sidebar (uses /reporter portal)
const ALL: Role[] = ["ADMIN", "EDITOR", "SUB_EDITOR"];
const EDITORIAL: Role[] = ["ADMIN", "EDITOR"];
const ADMIN_ONLY: Role[] = ["ADMIN"];

const navItems: { name: string; href: string; icon: string; roles: Role[] }[] = [
  { name: "Dashboard", href: "/", roles: ALL, icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  // Unified Content (Spec #1 #113) - single menu replaces Articles, Breaking News,
  // Videos, Photo Gallery, Web Stories, Reels, Cartoons, News Feed. Type filter
  // chips on the /content page let editors narrow to one content type.
  { name: "Content", href: "/content", roles: ALL, icon: "M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" },
  // News Feed (restored after H1 #131 cleanup). External news sources
  // (NewsData.io + Google News RSS) - import-as-draft per article.
  { name: "News Feed", href: "/news-feed", roles: EDITORIAL, icon: "M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2zM9 8h6M9 12h6M9 16h4" },
  { name: "Review Queue", href: "/review", roles: ALL, icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { name: "Categories", href: "/categories", roles: ADMIN_ONLY, icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" },
  { name: "Desks", href: "/desks", roles: ADMIN_ONLY, icon: "M4 6h16M4 10h16M4 14h10M4 18h7" },
  { name: "Mandi Prices", href: "/mandi", roles: EDITORIAL, icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" },
  // Gold + silver rates per Rayalaseema city. Editor enters daily; homepage
  // ticker and the public /gold-rate page both read the latest active row.
  { name: "Gold & Silver", href: "/precious-metals", roles: EDITORIAL, icon: "M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 14c-5.52 0-10-4.48-10-10S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10z" },
  { name: "Polls", href: "/polls", roles: EDITORIAL, icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { name: "Comments", href: "/comments", roles: EDITORIAL, icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { name: "ePaper", href: "/epaper", roles: EDITORIAL, icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { name: "ePaper Templates", href: "/epaper-templates", roles: ADMIN_ONLY, icon: "M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zM7 8h10M7 12h10M7 16h6" },
  { name: "ePaper Ads", href: "/epaper-ads", roles: EDITORIAL, icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" },
  { name: "ePaper Images", href: "/epaper-images", roles: EDITORIAL, icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { name: "ePaper Analytics", href: "/epaper-analytics", roles: EDITORIAL, icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  // Page Builder (Spec #2) - admin-editable templates for the public homepage
  // + every /category/<slug> page. Sub-pages live under /page-builder/.
  { name: "Page Builder", href: "/page-builder", roles: EDITORIAL, icon: "M4 5a2 2 0 012-2h12a2 2 0 012 2v3H4V5zM4 10h16v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9zm4 3h2v2H8v-2zm4 0h6v2h-6v-2z" },
  // Menu Builder (Spec #3 #177) - three named menus (header / footer /
  // mobile) editable as a drag-drop tree.
  { name: "Menu Builder", href: "/menu-builder/header", roles: EDITORIAL, icon: "M4 6h16M4 12h16M4 18h7" },
  { name: "Redirects", href: "/redirects", roles: EDITORIAL, icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
  { name: "Ads", href: "/ads", roles: ADMIN_ONLY, icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" },
  // Reporters merged into /users - admins reach reporter KYC + profile
  // from the merged Users table by filtering Role → Reporter, which auto-
  // shows Phone / District / KYC / Updates columns. The /reporters route
  // still exists for direct edits but no longer has its own nav entry.
  { name: "Payments", href: "/payments", roles: ADMIN_ONLY, icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" },
  { name: "Users", href: "/users", roles: ADMIN_ONLY, icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
  // Sits right under Users - every profile-change request originates from
  // a user (a reporter) and admins typically jump here from the Users
  // table's "Review N" deep link, so grouping them visually matches the
  // workflow.
  { name: "Profile Requests", href: "/profile-requests", roles: EDITORIAL, icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { name: "Audit Log", href: "/audit-log", roles: EDITORIAL, icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z M3 3l18 18" },
  { name: "Settings", href: "/settings", roles: ADMIN_ONLY, icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export function Sidebar({ initialRole }: { initialRole?: Role }) {
  const pathname = usePathname();
  // `initialRole` comes from the server (auth() in the dashboard layout)
  // so SSR already knows which items to render - no empty-nav flash while
  // useSession() probes on the client. useSession still runs so the nav
  // updates if the role changes mid-session (rare), but the SSR pass
  // doesn't depend on it.
  const { data: session } = useSession();
  const clientRole = (session?.user as any)?.role as Role | undefined;
  const role = clientRole ?? initialRole;
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const navRef = useRef<HTMLElement>(null);

  // Lock background scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Mobile top bar (hidden on desktop) */}
      <header className="admin-topbar">
        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", color: "#111827" }}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <img src="/logo.png" alt="Rayalaseema News" style={{ height: 26 }} />
      </header>

      {/* Drawer backdrop (mobile only, when open) */}
      <div className={`admin-backdrop${open ? " open" : ""}`} onClick={close} aria-hidden="true" />

      {/* Sidebar / off-canvas drawer */}
      <aside
        className={`admin-sidebar${open ? " open" : ""}`}
        style={{ width: 240, height: "100vh", background: "#111827", color: "#fff", position: "fixed", left: 0, top: 0, display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 50 }}
      >
        {/* Logo - wordmark alone, vertically centered. Mobile drawer closes
            by tapping the backdrop (admin-backdrop), so no explicit close
            button is rendered. */}
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center" }}>
          {/* White-on-transparent wordmark - sidebar bg is #111827, so the
              inverse logo (apps/admin/public/logo-inverse.svg) reads cleanly. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-inverse.svg" alt="Rayalaseema News" style={{ height: 44, width: "auto", display: "block" }} />
        </div>

        {/* Nav - filtered by the signed-in user's role. The API-side
            requireAuth([...]) check stays authoritative; this is just so a
            user doesn't see a link that would 403 when clicked. */}
        {/* `visibility: hidden` keeps the nav off-screen at the SSR/first
            -paint stage. The inline script below sets scrollTop AND flips
            visibility back to "visible" in the same synchronous block, so
            the user never sees the nav at scrollTop=0 - it appears with
            the active row already centred. The <noscript> fallback at the
            bottom of this file re-shows it if JS is disabled so the nav
            isn't permanently invisible in that case. */}
        <nav
          ref={navRef}
          id={SIDEBAR_NAV_ID}
          className="sidebar-nav"
          // The inline script below mutates this element's scrollTop +
          // visibility before React hydrates, so the runtime DOM no
          // longer matches the SSR HTML. `suppressHydrationWarning`
          // tells React not to diff the attributes of this node - which
          // is exactly the behaviour we want: the script's mutation IS
          // the source of truth post-load.
          suppressHydrationWarning
          style={{ flex: 1, overflowY: "auto", padding: "8px 0", visibility: "hidden" }}
        >
          {navItems.filter((item) => {
            // `role` resolves from initialRole (SSR) → client useSession
            // refinement, so SSR already filters the items by role and
            // the nav doesn't flash an empty state on first paint.
            if (!role) return false;
            // KYC gate is enforced by the proxy + dashboard banner - the
            // sidebar always shows every item the role normally sees so an
            // unverified editor knows what's coming once they're approved.
            // Clicking a locked item bounces to /onboarding/kyc.
            return item.roles.includes(role);
          }).map((item) => {
            // Exact-match OR child-route match. The trailing slash on the
            // prefix check is what stops sibling paths like /epaper-analytics
            // from lighting up /epaper as well as themselves.
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                // `data-active-nav` is read by the inline scroll script
                // below - it finds this element and scrolls the nav so
                // the active row is centred, all before first paint.
                data-active-nav={isActive ? "" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 20px", fontSize: 13, fontWeight: 600,
                  color: isActive ? "#fff" : "#9ca3af",
                  background: isActive ? "#FF2C2C" : "transparent",
                  textDecoration: "none",
                  borderLeft: isActive ? "3px solid #fff" : "3px solid transparent",
                }}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: isActive ? 1 : 0.6 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                </svg>
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User - clicking the avatar + name strip opens the profile page.
            Reporters get routed to /reporter/profile by the page itself; for
            everyone else it shows the editor-style profile. Sign Out stays
            below as a sibling so accidental link-fires don't log them out. */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #1f2937", fontSize: 12 }}>
          <Link
            href="/profile"
            onClick={close}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              textDecoration: "none",
              padding: "4px 6px",
              margin: "-4px -6px 4px -6px",
              borderRadius: 6,
              transition: "background 120ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#1f2937")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            title="View profile"
          >
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#FF2C2C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>
              {session?.user?.name?.[0] || "A"}
            </div>
            <div>
              <p style={{ color: "#fff", fontWeight: 600 }}>{session?.user?.name || "Admin"}</p>
              <p style={{ color: "#6b7280", fontSize: 11 }}>{(session?.user as any)?.role || "ADMIN"}</p>
            </div>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ width: "100%", padding: "6px 0", background: "#1f2937", color: "#9ca3af", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Auto-scroll the active nav item into view BEFORE first paint,
          THEN unhide the nav. The nav is rendered with visibility:hidden
          so nothing paints until this script flips it back - that's
          what kills the last nano-second flicker (modern browsers can
          paint mid-parse, so a no-hide version still flashes scrollTop=0
          for one frame on fast machines). The script is a plain inline
          <script> rendered into the SSR HTML; browsers run inline
          scripts synchronously during parsing, so the reveal happens
          before the first paint commits.
          `suppressHydrationWarning` is needed because React diffs the
          script body byte-for-byte and would otherwise warn even
          though the markup is identical on every render. */}
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html:
            "(function(){var n=document.getElementById('" +
            SIDEBAR_NAV_ID +
            "');if(!n)return;try{var a=n.querySelector('[data-active-nav]');if(a){var t=a.offsetTop-(n.clientHeight-a.clientHeight)/2;n.scrollTop=Math.max(0,t);}}catch(e){}n.style.visibility='visible';})();",
        }}
      />
      {/* Defensive: if JS is disabled the inline script above never
          runs, so make sure the nav is still visible by overriding the
          inline `visibility: hidden` with a higher-specificity rule. */}
      <noscript>
        <style>{`#${SIDEBAR_NAV_ID}{visibility:visible !important}`}</style>
      </noscript>
    </>
  );
}
