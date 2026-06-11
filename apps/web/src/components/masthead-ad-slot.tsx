// Masthead 728x90 leaderboard ad slot.
//
// Server component - fetches active LEADERBOARD ad from DB + falls through:
//   1. DB Ad (admin created in /ads with position=LEADERBOARD) - image+link
//      or sanitized htmlContent. Highest priority because it's our own
//      inventory and doesn't depend on AdSense approval.
//   2. Google AdSense leaderboard slot (config.google_adsense_id +
//      config.adsense_slot_header) - only injects the <ins> tag if both IDs
//      are set, otherwise AdSense fills with a default empty ad which looks
//      like a broken pixel.
//   3. Striped "Advertisement" placeholder - keeps the masthead grid
//      aligned during early-stage builds with no inventory yet.

import Image from "next/image";
import { getAdsByPosition } from "@/lib/db-queries";

/**
 * Server-side rewrite: replace every <img src="X"> in an HTML snippet
 * with <img src="/_next/image?url=X&w=W&q=75"> so the Next image
 * optimiser handles it. Used for admin-pasted ad HTML, where dropping
 * raw multi-MB PNGs into masthead/banner slots was the single biggest
 * LCP regression. Only http(s) absolute URLs are rewritten; data: URIs
 * and relative paths are left as-is.
 */
function rewriteHtmlImgs(html: string, targetWidth: number, targetHeight: number): string {
  if (!html || !html.includes("<img")) return html;
  return html.replace(/<img\b([^>]*?)\bsrc=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi,
    (_match, before, quote, srcUrl, after) => {
      const optimised = `/_next/image?url=${encodeURIComponent(srcUrl)}&w=${targetWidth}&q=60`;
      // Inject width/height ONLY when the admin's pasted snippet didn't
      // already declare them. PSI needs explicit dims to reserve the
      // slot (avoids CLS + forced reflow on load) but if the source
      // image's natural aspect differs from the slot (e.g. a 750x193
      // banner uploaded for a 728x90 slot), forcing 728x90 squashes
      // it and PSI's "Displays images with incorrect aspect ratio"
      // check fires. Preserving the admin's dims lets them control
      // the visual until they re-upload at the right ratio.
      const combined = before + after;
      const hasDims = /\b(width|height)=/i.test(combined);
      const dimAttrs = hasDims ? "" : ` width="${targetWidth}" height="${targetHeight}"`;
      return `<img${before}${dimAttrs} src=${quote}${optimised}${quote} loading="lazy" decoding="async"${after}>`;
    });
}

export async function MastheadAdSlot({
  config,
}: {
  config?: Record<string, string>;
}) {
  const ads = await getAdsByPosition("LEADERBOARD");
  const ad = ads[0];

  if (ad) {
    if (ad.htmlContent) {
      // Pre-sanitized by sanitizeAdRow in db-queries. We further rewrite any
      // raw <img src="X"> inside the snippet to /_next/image?url=X so the
      // Next image optimizer serves AVIF/WebP at the right size instead of
      // letting publishers (or the admin) ship multi-MB PNGs straight from
      // blob storage. PSI flagged the masthead hiring banner as 1.2 MB
      // because the previous direct-render path bypassed next/image.
      // Use 750 (a valid Next deviceSizes width) instead of 728 - the
      // optimizer 400s on widths that aren't in deviceSizes/imageSizes.
      const rewritten = rewriteHtmlImgs(ad.htmlContent, 750, 90);
      return (
        <div
          className="masthead-ad-slot"
          dangerouslySetInnerHTML={{ __html: rewritten }}
        />
      );
    }
    if (ad.imageUrl) {
      // next/image converts the source to AVIF/WebP on the fly and
      // serves it at the actual display size - was a 1.2 MB raw PNG
      // until this change (PSI flagged it as the biggest payload).
      const img = (
        <Image
          src={ad.imageUrl}
          alt={ad.name}
          width={728}
          height={90}
          sizes="(max-width: 768px) 100vw, 728px"
          quality={60}
          style={{ maxWidth: "100%", height: "auto", maxHeight: 90, display: "block", borderRadius: 4 }}
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
