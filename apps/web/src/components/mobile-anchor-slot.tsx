// Mobile sticky-bottom anchor ad — server component, DB-first priority.
//
// Position is fixed to the bottom of the viewport on mobile (md:hidden) so it
// stays visible while readers scroll articles. Eenadu/Sakshi/TV9 Telugu all
// use this pattern as the highest-revenue mobile slot.
//
// Priority:
//   1. DB Ad at MOBILE_ANCHOR — your own inventory
//   2. AdSense mobile_anchor slot — config.adsense_slot_mobile_anchor
//   3. null (renders nothing) — no empty white bar
//
// Mounted in the root layout so it appears on every page automatically.

import { getAdsByPosition } from "@/lib/db-queries";

export async function MobileAnchorSlot({
  config,
}: {
  config?: Record<string, string>;
}) {
  const ads = await getAdsByPosition("MOBILE_ANCHOR");
  const ad = ads[0];

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

  if (config?.google_adsense_id && config?.adsense_slot_mobile_anchor) {
    return (
      <div className="md:hidden" style={containerStyle}>
        <ins
          className="adsbygoogle"
          style={{ display: "inline-block", minHeight: 50, width: 320 }}
          data-ad-client={config.google_adsense_id}
          data-ad-slot={config.adsense_slot_mobile_anchor}
          data-ad-format="horizontal"
        />
      </div>
    );
  }

  return null;
}
