"use client";

import { useEffect, useRef, useState } from "react";

// ========== DB ADS (from admin panel) ==========

interface DbAd {
  id: string;
  position: string;
  htmlContent?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  name: string;
}

function DbAdRenderer({ ad }: { ad?: DbAd | null }) {
  if (!ad) return null;
  // htmlContent is pre-sanitized by sanitizeAdRow in apps/web/src/lib/db-queries.ts
  // (drops <script>, on* handlers, javascript: URLs, iframe/object/embed/form).
  // If you ever surface an Ad row from a different query, route it through
  // sanitizeAdHtml in lib/sanitize.ts before rendering.
  if (ad.htmlContent) return <div dangerouslySetInnerHTML={{ __html: ad.htmlContent }} />;
  if (ad.imageUrl) {
    const img = <img src={ad.imageUrl} alt={ad.name} style={{ width: "100%", display: "block", borderRadius: 4 }} />;
    return ad.linkUrl ? <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer">{img}</a> : img;
  }
  return null;
}

// ========== GOOGLE ADSENSE ==========
// Reads adsense ID from config. If not configured, shows DB ad or nothing.

// Slot name → config key mapping
const slotConfigKeys: Record<string, string> = {
  header_leaderboard: "adsense_slot_header",
  banner_mid: "adsense_slot_banner_mid",
  sidebar_square: "adsense_slot_sidebar",
  sidebar_sticky: "adsense_slot_sidebar_sticky",
  in_feed: "adsense_slot_in_feed",
  in_article: "adsense_slot_in_article",
  mobile_anchor: "adsense_slot_mobile_anchor",
};

function AdSenseUnit({ slot, format, style, responsive }: {
  slot: string;
  format?: string;
  style?: React.CSSProperties;
  responsive?: boolean;
}) {
  const adRef = useRef<HTMLModElement>(null);
  const [adsenseId, setAdsenseId] = useState("");
  const [slotId, setSlotId] = useState("");

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((cfg) => {
      if (cfg.google_adsense_id) {
        setAdsenseId(cfg.google_adsense_id);
        const configKey = slotConfigKeys[slot];
        if (configKey && cfg[configKey]) setSlotId(cfg[configKey]);
      }
    }).catch(() => {});
  }, [slot]);

  useEffect(() => {
    if (!adsenseId || !slotId || !adRef.current) return;
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {}
  }, [adsenseId, slotId]);

  if (!adsenseId || !slotId) return null;

  return (
    <ins
      ref={adRef}
      className="adsbygoogle"
      style={{ display: "block", ...style }}
      data-ad-client={adsenseId}
      data-ad-slot={slotId}
      data-ad-format={format || "auto"}
      data-full-width-responsive={responsive !== false ? "true" : "false"}
    />
  );
}

// ========== COMBINED AD COMPONENTS ==========
// Each tries: DB ad first → AdSense fallback → nothing

export function AdBannerMid({ ads = [] }: { ads?: DbAd[] }) {
  const dbAd = ads.find((a) => a.position === "BANNER_MID");
  if (dbAd) return <DbAdRenderer ad={dbAd} />;
  return (
    <div style={{ textAlign: "center", padding: "4px 0" }}>
      <AdSenseUnit slot="banner_mid" format="horizontal" style={{ minHeight: 90 }} />
    </div>
  );
}

export function AdSidebarSquare({ ads = [] }: { ads?: DbAd[] }) {
  const dbAd = ads.find((a) => a.position === "SIDEBAR_SQUARE");
  if (dbAd) return <DbAdRenderer ad={dbAd} />;
  return (
    <div style={{ marginTop: 8 }}>
      <AdSenseUnit slot="sidebar_square" style={{ minHeight: 250, width: "100%" }} />
    </div>
  );
}

export function AdLeaderboard({ ads = [] }: { ads?: DbAd[] }) {
  const dbAd = ads.find((a) => a.position === "LEADERBOARD");
  if (dbAd) return <DbAdRenderer ad={dbAd} />;
  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <AdSenseUnit slot="leaderboard" format="horizontal" style={{ minHeight: 90 }} />
    </div>
  );
}

export function AdInFeedBanner({ ads = [] }: { ads?: DbAd[] }) {
  const dbAd = ads.find((a) => a.position === "IN_FEED");
  if (dbAd) return <DbAdRenderer ad={dbAd} />;
  return (
    <div style={{ padding: "6px 0" }}>
      <AdSenseUnit slot="in_feed" format="fluid" style={{ minHeight: 60 }} />
    </div>
  );
}

// In-article ad (inside article body)
export function AdInArticle() {
  return (
    <div style={{ margin: "24px 0", textAlign: "center" }}>
      <AdSenseUnit slot="in_article" format="fluid" responsive />
    </div>
  );
}

// Header leaderboard (728x90)
export function AdHeaderLeaderboard({ ads = [] }: { ads?: DbAd[] }) {
  const dbAd = ads.find((a) => a.position === "HEADER_LEADERBOARD");
  if (dbAd) return <DbAdRenderer ad={dbAd} />;
  return (
    <div className="hidden md:block" style={{ textAlign: "center", padding: "4px 0", background: "#f9fafb" }}>
      <AdSenseUnit slot="header_leaderboard" format="horizontal" style={{ minHeight: 90, maxWidth: 728, margin: "0 auto" }} />
    </div>
  );
}

// Sticky sidebar ad (300x600)
export function AdSidebarSticky({ ads = [] }: { ads?: DbAd[] }) {
  const dbAd = ads.find((a) => a.position === "SIDEBAR_TALL");
  if (dbAd) return <div style={{ position: "sticky", top: 80 }}><DbAdRenderer ad={dbAd} /></div>;
  return (
    <div style={{ position: "sticky", top: 80, marginTop: 8 }}>
      <AdSenseUnit slot="sidebar_sticky" style={{ minHeight: 600, width: "100%" }} />
    </div>
  );
}

// Mobile anchor ad (sticky bottom)
export function AdMobileAnchor() {
  return (
    <div className="md:hidden" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9990, textAlign: "center", background: "#fff", borderTop: "1px solid #eee", padding: "2px 0" }}>
      <AdSenseUnit slot="mobile_anchor" format="horizontal" style={{ minHeight: 50 }} />
    </div>
  );
}
