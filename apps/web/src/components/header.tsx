"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchBar } from "./search-bar";
import { MarketTicker } from "./market-ticker";
import { categoryHref, normalizeSectionHref } from "@/lib/category-href";
import { Button } from "@/components/ui/button";

// Rayalaseema districts ARE the main nav - this is a Rayalaseema newspaper
const mainNavItems = [
  { name: "హోమ్", slug: "/", isHome: true },
  { name: "కర్నూలు", slug: "/kurnool" },
  { name: "నంద్యాల", slug: "/nandyal" },
  { name: "అనంతపురం", slug: "/ananthapuramu" },
  { name: "శ్రీ సత్యసాయి", slug: "/sri-sathya-sai" },
  { name: "వై.యస్.ఆర్", slug: "/ysr-kadapa" },
  { name: "తిరుపతి", slug: "/tirupati" },
  { name: "అన్నమయ్య", slug: "/annamayya" },
  { name: "చిత్తూరు", slug: "/chittoor" },
  { name: "క్రీడలు", slug: "/sports" },
  { name: "సినిమా", slug: "/entertainment" },
  { name: "రాశి ఫలాలు", slug: "/horoscope" },
  { name: "మరిన్ని ❯", slug: "#", isDropdown: true },
];

// These go in the "మరిన్ని" dropdown
const dropdownItems = [
  { name: "ఆంధ్రప్రదేశ్", slug: "/andhra-pradesh" },
  { name: "తెలంగాణ", slug: "/telangana" },
  { name: "జాతీయం", slug: "/national" },
  { name: "అంతర్జాతీయం", slug: "/international" },
  { name: "బిజినెస్", slug: "/business" },
  { name: "టెక్నాలజీ", slug: "/technology" },
  { name: "సినిమా రివ్యూలు", slug: "/movie-reviews" },
  { name: "పరీక్షా ఫలితాలు", slug: "/exam-results" },
  { name: "ఉద్యోగాలు", slug: "/jobs" },
  { name: "వ్యవసాయం", slug: "/agriculture" },
  { name: "విద్య", slug: "/education" },
  { name: "ఆరోగ్యం", slug: "/health" },
  { name: "భక్తి", slug: "/devotional" },
  { name: "నేరాలు", slug: "/crime" },
  { name: "నవ్యసీమ", slug: "/navyaseema" },
  { name: "NRI వార్తలు", slug: "/nri" },
  { name: "వాతావరణం", slug: "/weather" },
  { name: "రియల్ ఎస్టేట్", slug: "/real-estate" },
  { name: "ఫీచర్ పేజీలు", slug: "/features" },
  { name: "సంపాదకీయం", slug: "/editorial" },
  { name: "పాఠకుల లేఖలు", slug: "/reader-letters" },
  { name: "రాయలసీమ రుచులు", slug: "/rayalaseema-ruchulu" },
  { name: "ఎట్టెట 😄", slug: "/yetteta" },
  { name: "పజిల్స్", slug: "/puzzles" },
];

interface HeaderProps {
  config?: Record<string, string>;
  breakingNews?: { id: string; text: string }[];
  // Optional pre-rendered live-data strip. Pages that pass <MarketTickerServer />
  // here get a server-rendered bar with zero client-side flash; pages that
  // omit it fall back to the legacy <MarketTicker /> below (data fetched in
  // useEffect, ~300ms empty-bar moment on refresh).
  tickerSlot?: React.ReactNode;
  // Pre-rendered masthead ad (server component MastheadAdSlot). When
  // provided, replaces the inline AdSense fallback below so DB ads (admin-
  // created at /ads with position=LEADERBOARD) take priority over AdSense.
  mastheadAdSlot?: React.ReactNode;
}

export function Header({ config: initialConfig = {}, breakingNews: initialBreaking = [], tickerSlot, mastheadAdSlot }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [config, setConfig] = useState(initialConfig);
  const [breakingNews, setBreakingNews] = useState(initialBreaking);
  const [tickerPaused, setTickerPaused] = useState(false);
  // Spec #3 E1 (#183) - admin-published HEADER menu, fetched on mount.
  // While loading or when unpublished, we fall back to the hardcoded
  // `mainNavItems` + `dropdownItems` above so the nav is never empty.
  const [adminTop, setAdminTop] = useState<typeof mainNavItems | null>(null);
  const [adminDrop, setAdminDrop] = useState<typeof dropdownItems | null>(null);
  const fetchedRef = useRef(false);
  const pathname = usePathname();
  // True when this nav item maps to the current URL. Home matches only "/";
  // other items match exactly OR are a path prefix (so /district/kurnool/foo
  // still highlights "కర్నూలు").
  const isActive = (slug: string) => {
    if (slug === "/") return pathname === "/";
    return pathname === slug || pathname.startsWith(`${slug}/`);
  };

  useEffect(() => {
    // Guard against StrictMode double-invocation + accidental re-fetch from prop change
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    if (breakingNews.length === 0) {
      fetch("/api/breaking-news").then((r) => r.json()).then((data) => {
        if (Array.isArray(data)) setBreakingNews(data.map((b: any) => ({ id: b.id, text: b.headline || b.text })));
      }).catch(() => {});
    }
    if (Object.keys(config).length === 0) {
      fetch("/api/config").then((r) => r.json()).then(setConfig).catch(() => {});
    }
    // Spec #3 E1 - admin-published HEADER menu replaces hardcoded items
    // when present. Items at depth 0 with children become the dropdown;
    // items without children become inline nav.
    fetch("/api/menu/header").then((r) => r.json()).then((data) => {
      const items = Array.isArray(data?.items) ? data.items : [];
      if (items.length === 0) return;
      const top: typeof mainNavItems = [{ name: "హోమ్", slug: "/", isHome: true }];
      const drop: typeof dropdownItems = [];
      let hasDropdown = false;
      for (const it of items) {
        const href = (() => {
          const t = it.target;
          if (!t) return "#";
          if (t.type === "CATEGORY") return categoryHref(t.categorySlug);
          // INTERNAL_URL items persist legacy /category|/district paths; the
          // sections now live at the bare slug, so normalize on render.
          if (t.type === "INTERNAL_URL") return normalizeSectionHref(t.url);
          if (t.type === "EXTERNAL_URL") return t.url;
          if (t.type === "CONTENT" && t.contentSlugCache && t.contentTypeCache) {
            const prefix: Record<string, string> = {
              ARTICLE: "/article", VIDEO: "/video", REEL: "/reel",
              WEB_STORY: "/story", PHOTO_GALLERY: "/gallery", CARTOON: "/cartoon",
            };
            return `${prefix[t.contentTypeCache] || ""}/${t.contentSlugCache}`;
          }
          return "#";
        })();
        if (Array.isArray(it.children) && it.children.length > 0) {
          hasDropdown = true;
          for (const c of it.children) {
            const ct = c.target;
            const childHref = ct?.type === "CATEGORY" ? categoryHref(ct.categorySlug)
              : ct?.type === "INTERNAL_URL" ? normalizeSectionHref(ct.url)
              : ct?.type === "EXTERNAL_URL" ? ct.url
              : "#";
            drop.push({ name: c.label, slug: childHref });
          }
        } else {
          top.push({ name: it.label, slug: href });
        }
      }
      if (hasDropdown) top.push({ name: "మరిన్ని ❯", slug: "#", isDropdown: true });
      setAdminTop(top);
      setAdminDrop(drop);
    }).catch(() => {});
  }, []);

  // Active nav items - admin menu wins when published; otherwise hardcoded.
  const activeMain = adminTop || mainNavItems;
  const activeDrop = adminDrop || dropdownItems;

  // ⌘K / Ctrl+K opens the search palette - canonical shadcn behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="bg-white">
      {/* Breaking News Ticker - 40px-tall row. Inner children share the
          parent's height via items-center + height: 100%, so the BREAKING
          badge and the ticker line up perfectly with no extra padding gap
          above or below the bar. Text bumped to 14px to match the taller
          row - 13px looked stranded in a 40px container. */}
      <div style={{ background: "#000", overflow: "hidden", whiteSpace: "nowrap" as const, height: 40 }}>
        <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
          <span style={{ background: "var(--color-brand)", color: "#fff", padding: "0 16px", height: "100%", fontSize: 14, fontWeight: 900, lineHeight: 1, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span className="animate-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", display: "inline-block" }} aria-hidden="true" />
            BREAKING
          </span>
          <div style={{ overflow: "hidden", flex: 1, height: "100%", display: "flex", alignItems: "center" }}>
            <div
              className="animate-marquee"
              style={{
                display: "inline-block",
                whiteSpace: "nowrap" as const,
                animationDuration: `${(config.ticker_speed || 30)}s`,
                animationPlayState: tickerPaused ? "paused" : "running",
              }}
            >
              {breakingNews.map((item, i) => (
                <span key={item.id || i}>
                  <a href="#" style={{ color: "#fff", fontSize: 14, fontWeight: 700, lineHeight: 1, textDecoration: "none", marginLeft: 24, marginRight: 24 }}>
                    {item.text}
                  </a>
                  {i < breakingNews.length - 1 && <span style={{ color: "var(--color-brand)" }}>●</span>}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => setTickerPaused((p) => !p)}
            aria-label={tickerPaused ? "Resume ticker" : "Pause ticker"}
            style={{ padding: "6px 10px", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
          >
            {tickerPaused ? (
              <svg width="14" height="14" fill="#fff" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            ) : (
              <svg width="14" height="14" fill="#fff" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
            )}
          </button>
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            aria-label="Toggle search"
            style={{ padding: "6px 12px", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
          >
            <svg width="16" height="16" fill="none" stroke="#fff" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Live data ticker - slim row directly under BREAKING. Pulls gold +
          silver + forex + mandi + cricket from /api/tickers. Pages that
          pass `tickerSlot={<MarketTickerServer />}` get the bar rendered
          server-side (zero flash); others fall back to the client variant
          which fetches in useEffect. */}
      {tickerSlot ?? <MarketTicker />}

      {/* Search panel - slow reveal via framer-motion, shadcn Input inside */}
      <SearchBar open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Masthead - Eenadu style: Logo left, ad center, links right */}
      <div className="container-news">
        <div className="flex items-center py-1.5 gap-4">
          {/* Left: Logo with date BELOW (Eenadu masthead convention).
              Wrapping container is flex-col so the date sits under the wordmark
              instead of beside it with a vertical divider. */}
          <div className="shrink-0 flex flex-col items-start gap-0.5">
            <Link href="/" className="block">
              {/* PNGs are tiny (165–211 KB) vs the 2.2 MB SVG masthead. Mobile
                  showed the old logo because the heavy SVG either failed to
                  decode or was served from a stale browser cache. The PNG fix
                  guarantees a fresh, light asset; responsive `<picture>` swaps
                  the icon-only square on phones for the full wordmark on
                  tablets+. */}
              <picture>
                <source media="(min-width: 768px)" srcSet="/logo.png" />
                <img
                  src="/logo-icon.png"
                  alt="రాయలసీమ న్యూస్"
                  className="h-12 md:h-16 w-auto"
                />
              </picture>
            </Link>
            {/* Day + date on ONE line, aligned under the wordmark's first
                Telugu letter "ర" — not under the map-icon at the start of
                the logo. The logo's red map glyph occupies roughly the first
                14% of the wordmark width; padding-left:14% (~44px @ h-16)
                shifts the date row to start where the wordmark text starts. */}
            <div className="hidden md:flex items-baseline gap-1.5 mt-0.5 self-stretch" style={{ paddingLeft: "14%" }}>
              <span className="text-[13px] font-bold text-gray-900 leading-tight whitespace-nowrap" style={{ fontFamily: "var(--font-telugu-heading)" }}>
                {new Date().toLocaleDateString("te-IN", { weekday: "long" })}
              </span>
              <span className="text-[11px] text-gray-400 leading-none">·</span>
              <span className="text-[12px] font-semibold text-gray-600 leading-tight whitespace-nowrap" style={{ fontFamily: "var(--font-telugu-body)" }}>
                {new Date().toLocaleDateString("te-IN", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
          </div>

          {/* Center: Masthead ad slot. md:flex (was lg:flex) so tablets at
              768px+ also see the leaderboard — they're a meaningful slice
              of Telugu mobile-to-tablet readers and were getting no ad. */}
          <div className="hidden md:flex flex-1 items-center justify-center min-w-0">
            {mastheadAdSlot ?? (
              <div className="masthead-ad-slot">
                <span className="masthead-ad-placeholder">Advertisement</span>
              </div>
            )}
          </div>

          {/* Right: 3 stacked icon-tiles, Eenadu masthead style. Latest +
              Breaking on top row, E-PAPER full-width below. */}
          <div className="hidden lg:flex flex-col items-end gap-1 shrink-0">
            <div className="flex gap-1">
              <Link href="/" className="masthead-tile" aria-label="Latest news">
                <svg className="size-5" fill="none" stroke="var(--n-700, #374151)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>
                <span className="masthead-tile-label">Latest</span>
              </Link>
              <Link href="/" className="masthead-tile masthead-tile-breaking" aria-label="Breaking news">
                <svg className="size-5" fill="none" stroke="var(--brand, #E01B1B)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/></svg>
                <span className="masthead-tile-label">Breaking</span>
              </Link>
            </div>
            <Link href="/epaper" className="masthead-tile masthead-tile-epaper" aria-label="E-Paper">
              <svg className="size-4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2"/></svg>
              <span className="text-[11px] font-bold tracking-[0.08em]">E-PAPER</span>
            </Link>
          </div>

          {/* Mobile: hamburger */}
          <div className="lg:hidden ml-auto">
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>
      </header>

      {/* Navigation Bar - sticky across the page scroll. Lives OUTSIDE <header>
          so its containing block is <body>, otherwise position:sticky would
          stop the moment the (short) header ends. */}
      <nav className="nav-gradient shadow-md relative sticky top-0 z-40">
        <div className="container-news">
          {/* h-10 on the <ul> + items-stretch on flex makes every <li>
              (and its child link/button) fill the full nav-bar height -
              so the active-state bg-white/20 paints the entire row top-
              to-bottom, not just the inline content area. */}
          <ul className="hidden lg:flex items-stretch h-10">
            {activeMain.map((item, i) => (
              <li key={item.slug} className="relative flex">
                {item.isDropdown ? (
                  /* "మరిన్ని" dropdown trigger + panel anchored to this <li> */
                  <>
                    <button
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
                      className="flex items-center justify-center px-4 text-[13px] leading-none hover:bg-white/20 transition-colors whitespace-nowrap font-telugu fw-bold"
                      style={{ color: "#fff" }}
                    >
                      {item.name}
                    </button>
                    {dropdownOpen && (
                      <div style={{
                        position: "absolute", right: 0, top: "100%",
                        background: "#fff", border: "1px solid #e5e7eb",
                        borderRadius: "0 0 10px 10px",
                        boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
                        zIndex: 50,
                        width: "min(420px, calc(100vw - 24px))",
                        maxWidth: 420,
                        padding: "8px 0",
                      }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                          {activeDrop.map((dItem) => (
                            <Link
                              key={dItem.slug}
                              href={dItem.slug}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => setDropdownOpen(false)}
                              style={{
                                display: "block", padding: "8px 16px",
                                fontSize: 14, fontWeight: 700, color: "#333",
                                textDecoration: "none", borderBottom: "1px solid #f5f5f5",
                                transition: "all 0.15s",
                              }}
                              className="hover:bg-red-50 hover:text-[var(--color-brand)]"
                            >
                              {dItem.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.slug}
                    className={`flex items-center justify-center px-3 text-[13px] leading-none hover:bg-white/20 transition-colors whitespace-nowrap font-telugu border-r border-white/15 ${
                      isActive(item.slug) ? "bg-white/20" : ""
                    }`}
                    style={{ color: "#fff" }}
                  >
                    {(item as any).isHome ? (
                      // Sized to match the Telugu text x-height in sibling
                      // links - 22px reads as ~the same visual weight as
                      // "కర్నూలు" / "నంద్యాల" at 13px Noto Sans Telugu, so
                      // the icon no longer looks short next to the words.
                      <svg className="block" width="22" height="22" fill="#fff" viewBox="0 0 24 24" aria-label="Home">
                        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                      </svg>
                    ) : (
                      item.name
                    )}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Mobile Menu - Slides up from bottom like Eenadu */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Menu panel from bottom */}
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto mobile-menu-slide">
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Close + Title */}
            <div className="flex items-center justify-between px-4 pb-2 border-b border-gray-100">
              <span className="text-sm font-bold text-gray-800">మెనూ</span>
              <button onClick={() => setMobileMenuOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
                <svg className="w-4 h-4" fill="none" stroke="#666" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Quick Actions - uniform brand-red tints */}
            <div className="grid grid-cols-4 gap-2 p-3 border-b border-gray-100">
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex flex-col items-center gap-1 p-2 rounded-lg" style={{ background: "var(--color-brand-bg)" }}>
                <svg className="w-5 h-5" style={{ color: "var(--color-brand)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                <span className="text-[10px] font-bold" style={{ color: "var(--color-brand)" }}>హోమ్</span>
              </Link>
              <Link href="/search" onClick={() => setMobileMenuOpen(false)} className="flex flex-col items-center gap-1 p-2 rounded-lg" style={{ background: "var(--color-brand-bg)" }}>
                <svg className="w-5 h-5" style={{ color: "var(--color-brand)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <span className="text-[10px] font-bold" style={{ color: "var(--color-brand)" }}>వెతకండి</span>
              </Link>
              <Link href="/epaper" onClick={() => setMobileMenuOpen(false)} className="flex flex-col items-center gap-1 p-2 rounded-lg" style={{ background: "var(--color-brand-bg)" }}>
                <svg className="w-5 h-5" style={{ color: "var(--color-brand)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2"/></svg>
                <span className="text-[10px] font-bold" style={{ color: "var(--color-brand)" }}>ePaper</span>
              </Link>
              <Link href="/horoscope" onClick={() => setMobileMenuOpen(false)} className="flex flex-col items-center gap-1 p-2 rounded-lg" style={{ background: "var(--color-brand-bg)" }}>
                <span className="text-lg">⭐</span>
                <span className="text-[10px] font-bold" style={{ color: "var(--color-brand)" }}>రాశులు</span>
              </Link>
            </div>

            {/* Districts - horizontal scroll chips */}
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-brand)] font-extrabold mb-2">రాయలసీమ జిల్లాలు</p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {activeMain.filter((i: any) => !i.isDropdown && !i.isHome).map((item: any) => (
                  <Link
                    key={item.slug}
                    href={item.slug}
                    onClick={() => setMobileMenuOpen(false)}
                    className="shrink-0 px-3 py-1.5 rounded-full bg-gray-100 text-xs font-bold text-gray-700 hover:bg-red-50 hover:text-[var(--color-brand)]"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* Categories - grid */}
            <div className="px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-extrabold mb-2">విభాగాలు</p>
              <div className="grid grid-cols-3 gap-1.5">
                {activeDrop.map((item) => (
                  <Link
                    key={item.slug}
                    href={item.slug}
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-3 py-2.5 rounded-lg bg-gray-50 text-xs font-bold text-gray-700 text-center hover:bg-red-50 hover:text-[var(--color-brand)] transition-colors"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* Bottom safe area */}
            <div className="h-6" />
          </div>
        </>
      )}

      <style>{`
        .mobile-menu-slide {
          animation: slideFromBottom 0.3s ease-out;
        }
        @keyframes slideFromBottom {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        /* === Masthead center AdSense slot (Eenadu-style) === */
        .masthead-ad-slot {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          max-width: 728px;
          min-height: 90px;
        }
        .masthead-ad-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          max-width: 728px;
          height: 90px;
          font-family: var(--font-sans, system-ui);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: #b0b6bf;
          background: repeating-linear-gradient(45deg, #fafbfc 0 10px, #f4f5f7 10px 20px);
          border: 1px dashed #d8dde3;
          border-radius: 4px;
          text-transform: uppercase;
        }

        /* === Masthead right quick-tiles (Latest / Breaking / E-PAPER) === */
        .masthead-tile {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          min-width: 58px;
          padding: 4px 10px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          text-decoration: none;
          transition: background 0.15s, border-color 0.15s, transform 0.15s;
        }
        .masthead-tile:hover {
          background: #f9fafb;
          border-color: #d1d5db;
          transform: translateY(-1px);
        }
        .masthead-tile-label {
          font-family: var(--font-sans, system-ui);
          font-size: 11px;
          font-weight: 700;
          color: var(--n-800, #1f2937);
          letter-spacing: 0.02em;
        }
        .masthead-tile-breaking .masthead-tile-label {
          color: var(--brand, #E01B1B);
        }
        .masthead-tile-breaking { border-color: #fecaca; background: #fff5f5; }
        .masthead-tile-breaking:hover { background: #fff1f1; border-color: #f87171; }
        .masthead-tile-epaper {
          flex-direction: row;
          gap: 6px;
          padding: 6px 14px;
          width: 100%;
          background: var(--brand, #E01B1B);
          color: #fff;
          border-color: var(--brand-dark, #B91414);
          font-weight: 800;
        }
        .masthead-tile-epaper:hover {
          background: var(--brand-dark, #B91414);
          border-color: var(--brand-dark, #B91414);
        }
      `}</style>
    </>
  );
}
