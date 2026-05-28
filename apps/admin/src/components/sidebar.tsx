"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/roles";

// Key used to persist the sidebar's nav-scroll position across navigations.
// The sidebar component remounts on every route change (it's imported by
// each page rather than living in a (dashboard) layout), so the <nav>
// scrollTop resets to 0 on click - making the active item jump out of view
// if the user had scrolled to find it. Storing the offset in sessionStorage
// (so it clears on tab close) preserves the scroll across remounts.
const SIDEBAR_SCROLL_KEY = "admin-sidebar-scroll";

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
  { name: "Ads", href: "/ads", roles: ADMIN_ONLY, icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" },
  // Reporters merged into /users - admins reach reporter KYC + profile
  // from the merged Users table by filtering Role → Reporter, which auto-
  // shows Phone / District / KYC / Updates columns. The /reporters route
  // still exists for direct edits but no longer has its own nav entry.
  { name: "Profile Requests", href: "/profile-requests", roles: EDITORIAL, icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { name: "Payments", href: "/payments", roles: ADMIN_ONLY, icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" },
  { name: "Users", href: "/users", roles: ADMIN_ONLY, icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
  { name: "Audit Log", href: "/audit-log", roles: EDITORIAL, icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z M3 3l18 18" },
  { name: "Settings", href: "/settings", roles: ADMIN_ONLY, icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export function Sidebar() {
  const pathname = usePathname();
  // `status` tells us whether NextAuth has finished its session probe. During
  // the loading state we render every item so the sidebar isn't visibly
  // empty for ~200–500 ms after every page load - the API still 403s any
  // route the user shouldn't reach, so this is a UX optimisation, not a
  // security boundary.
  const { data: session, status } = useSession();
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

  // Restore nav scroll position on mount (the sidebar remounts on every
  // route change because it lives in each page rather than a layout -
  // without this, clicking a link further down the nav resets the scroll
  // to the top of the list, hiding the item the user just selected).
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const saved = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (saved) nav.scrollTop = Number(saved) || 0;
    const handler = () => {
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(nav.scrollTop));
    };
    nav.addEventListener("scroll", handler, { passive: true });
    return () => nav.removeEventListener("scroll", handler);
  }, []);

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
        <img src="/logo.png" alt="Rayalaseema Express" style={{ height: 26 }} />
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
          <img src="/logo-inverse.svg" alt="Rayalaseema Express" style={{ height: 44, width: "auto", display: "block" }} />
        </div>

        {/* Nav - filtered by the signed-in user's role. The API-side
            requireAuth([...]) check stays authoritative; this is just so a
            user doesn't see a link that would 403 when clicked. */}
        <nav ref={navRef} className="sidebar-nav" style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {navItems.filter((item) => {
            // While the session is still loading, render NOTHING. Previously
            // we rendered every item to avoid an empty-sidebar flash, but
            // that caused a worse UX issue: a SUB_EDITOR refreshing on /
            // would briefly see admin-only items (Users, Categories, Desks,
            // Settings) before NextAuth resolved and the list collapsed.
            // Showing wrong items is more confusing than a sub-second gap,
            // especially since the footer card already shows the role.
            if (status === "loading") return false;
            if (status !== "authenticated") return false;
            const role = (session?.user as any)?.role as Role | undefined;
            if (!role) return false;
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
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 20px", fontSize: 13, fontWeight: 600,
                  color: isActive ? "#fff" : "#9ca3af",
                  background: isActive ? "#FF2C2C" : "transparent",
                  textDecoration: "none", transition: "all 0.15s",
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

        {/* User */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #1f2937", fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#FF2C2C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>
              {session?.user?.name?.[0] || "A"}
            </div>
            <div>
              <p style={{ color: "#fff", fontWeight: 600 }}>{session?.user?.name || "Admin"}</p>
              <p style={{ color: "#6b7280", fontSize: 11 }}>{(session?.user as any)?.role || "ADMIN"}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ width: "100%", padding: "6px 0", background: "#1f2937", color: "#9ca3af", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
