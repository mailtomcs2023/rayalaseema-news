// Mobile sticky-bottom anchor ad — server component, DB-first priority.
//
// Position is fixed to the bottom of the viewport on mobile (md:hidden) so it
// stays visible while readers scroll articles. Eenadu/Sakshi/TV9 Telugu all
// use this pattern as the highest-revenue mobile slot.
//
// Priority:
//   1. DB Ad at MOBILE_ANCHOR — phone-specific inventory the admin uploaded
//      at the right 320x100 crop.
//   2. DB Ad at LEADERBOARD — re-use the masthead ad if no phone variant is
//      configured. Saves admins from re-uploading the same hiring/promo banner
//      twice; CSS scales the leaderboard image to the phone width.
//   3. AdSense mobile_anchor slot — config.adsense_slot_mobile_anchor.
//   4. AdSense leaderboard slot — mirrors the desktop masthead AdSense unit
//      so even an AdSense-only setup fills the phone bottom.
//   5. null (renders nothing) — no empty white bar.
//
// Mounted in the root layout so it appears on every page automatically.

import { getAdsByPosition } from "@/lib/db-queries";

export async function MobileAnchorSlot({
  config,
}: {
  config?: Record<string, string>;
}) {
  // Try the phone-specific slot first; if nothing's there, reuse whatever
  // the masthead leaderboard is currently serving so a single admin ad
  // covers both surfaces.
  const mobileAds = await getAdsByPosition("MOBILE_ANCHOR");
  let ad = mobileAds[0];
  if (!ad) {
    const lbAds = await getAdsByPosition("LEADERBOARD");
    ad = lbAds[0];
  }

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9990,
    textAlign: "center",
    background: "#fff",
    borderTop: "1px solid #e5e7eb",
    padding: "4px 0",
    boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
  };

  if (ad) {
    if (ad.htmlContent) {
      return (
        <div className="md:hidden" style={containerStyle}>
          <div dangerouslySetInnerHTML={{ __html: ad.htmlContent }} />
        </div>
      );
    }
    if (ad.imageUrl) {
      const img = (
        <img
          src={ad.imageUrl}
          alt={ad.name}
          loading="lazy"
          style={{ maxWidth: "100%", maxHeight: 90, display: "inline-block" }}
        />
      );
      const wrapped = ad.linkUrl ? (
        <a
          href={ad.linkUrl}
          target={ad.linkUrl.startsWith("http") ? "_blank" : undefined}
          rel="noopener noreferrer"
        >
          {img}
        </a>
      ) : (
        img
      );
      return (
        <div className="md:hidden" style={containerStyle}>
          {wrapped}
        </div>
      );
    }
  }

  // AdSense fallbacks — mobile-specific slot first, then the masthead
  // leaderboard slot if mobile_anchor isn't configured. Either fills the
  // 320x90-ish phone bottom; AdSense returns responsive sizing on its end.
  const adSenseClient = config?.google_adsense_id;
  const adSenseSlot =
    config?.adsense_slot_mobile_anchor || config?.adsense_slot_header;
  if (adSenseClient && adSenseSlot) {
    return (
      <div className="md:hidden" style={containerStyle}>
        <ins
          className="adsbygoogle"
          style={{ display: "inline-block", minHeight: 50, width: 320 }}
          data-ad-client={adSenseClient}
          data-ad-slot={adSenseSlot}
          data-ad-format="horizontal"
        />
      </div>
    );
  }

  return null;
}
