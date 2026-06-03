// Masthead 728x90 leaderboard ad slot.
//
// Server component — fetches active LEADERBOARD ad from DB + falls through:
//   1. DB Ad (admin created in /ads with position=LEADERBOARD) — image+link
//      or sanitized htmlContent. Highest priority because it's our own
//      inventory and doesn't depend on AdSense approval.
//   2. Google AdSense leaderboard slot (config.google_adsense_id +
//      config.adsense_slot_header) — only injects the <ins> tag if both IDs
//      are set, otherwise AdSense fills with a default empty ad which looks
//      like a broken pixel.
//   3. Striped "Advertisement" placeholder — keeps the masthead grid
//      aligned during early-stage builds with no inventory yet.

import { getAdsByPosition } from "@/lib/db-queries";

export async function MastheadAdSlot({
  config,
}: {
  config?: Record<string, string>;
}) {
  const ads = await getAdsByPosition("LEADERBOARD");
  const ad = ads[0];

  if (ad) {
    if (ad.htmlContent) {
      // Pre-sanitized by sanitizeAdRow in db-queries.
      return (
        <div
          className="masthead-ad-slot"
          dangerouslySetInnerHTML={{ __html: ad.htmlContent }}
        />
      );
    }
    if (ad.imageUrl) {
      const img = (
        <img
          src={ad.imageUrl}
          alt={ad.name}
          loading="lazy"
          style={{ maxWidth: "100%", maxHeight: 90, display: "block", borderRadius: 4 }}
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
      return <div className="masthead-ad-slot">{wrapped}</div>;
    }
  }

  if (config?.google_adsense_id && config?.adsense_slot_header) {
    return (
      <div className="masthead-ad-slot">
        <ins
          className="adsbygoogle"
          style={{ display: "block", width: 728, height: 90 }}
          data-ad-client={config.google_adsense_id}
          data-ad-slot={config.adsense_slot_header}
          data-ad-format="horizontal"
          data-full-width-responsive="false"
        />
      </div>
    );
  }

  return (
    <div className="masthead-ad-slot">
      <span className="masthead-ad-placeholder">Advertisement</span>
    </div>
  );
}
