"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Shared sidebar/rail ad card. ONE component for every rail ad slot
// (AboveFold, SectionBand, CinemaBand…). It:
//   1. fetches the admin-configured house ad for `position` (default
//      SIDEBAR_SQUARE) from /api/ads/[position],
//   2. renders that ad (image or sanitized HTML, optional click-through) when
//      one exists,
//   3. otherwise shows the striped "ADVERTISEMENT" placeholder.
//
// Configure the ad in Admin → Ads (slot "Sidebar Square 300x250"); it then
// appears in every <RailAd> across the site. Styles live in globals.css
// (.rail-ad*) so multiple instances don't each inject a <style> block.

interface RailAdData {
  id: string;
  name: string;
  imageUrl?: string | null;
  linkUrl?: string | null;
  htmlContent?: string | null;
  bgColor?: string | null;
}

export function RailAd({
  position = "SIDEBAR_SQUARE",
  tall = false,
}: {
  position?: string;
  tall?: boolean;
}) {
  const [ad, setAd] = useState<RailAdData | null>(null);
  // Page the ad renders on - lets an admin target an ad to one specific page
  // (e.g. only /nandyal). A page-specific ad wins over a global one for the slot.
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    const qs = pathname ? `?path=${encodeURIComponent(pathname)}` : "";
    fetch(`/api/ads/${position}${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setAd(d?.ad ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [position, pathname]);

  const cls = `rail-ad${tall ? " rail-ad--tall" : ""}`;

  // A configured house ad → render image or HTML, optionally wrapped in a link.
  if (ad && (ad.imageUrl || ad.htmlContent)) {
    const inner = ad.htmlContent ? (
      // htmlContent is sanitized server-side (sanitizeAdRow drops scripts /
      // handlers / iframes) before it reaches this component.
      <div dangerouslySetInnerHTML={{ __html: ad.htmlContent }} />
    ) : (
      <img
        src={`/_next/image?url=${encodeURIComponent(ad.imageUrl as string)}&w=640&q=60`}
        alt={ad.name}
        loading="lazy"
        decoding="async"
      />
    );
    const body = ad.linkUrl ? (
      <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer sponsored">
        {inner}
      </a>
    ) : (
      inner
    );
    return (
      <div className={`${cls} rail-ad--filled`} style={ad.bgColor ? { background: ad.bgColor } : undefined}>
        {body}
      </div>
    );
  }

  // No ad configured (or still loading) → striped placeholder.
  return (
    <div className={cls} aria-hidden="true">
      ADVERTISEMENT
    </div>
  );
}
