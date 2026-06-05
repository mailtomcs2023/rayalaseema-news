// /ads.txt - IAB Tech Lab Authorized Digital Sellers spec.
// Used by AdSense for site ownership verification and by all programmatic
// buyers to confirm that this site is authorized to sell ads via the listed
// reseller relationships. Without this file ad inventory is treated as
// unauthorized → CPM crashes.
//
// Pulls publisher ID from SiteConfig (admin-editable) so we never hardcode
// the ca-pub identifier. If unset the route serves a minimal empty body
// (still 200 - IAB spec is OK with an empty ads.txt for now).

import { getSiteConfig } from "@/lib/db-queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getSiteConfig();
  const adsenseId = (config.google_adsense_id || "").trim();
  // ca-pub-XXXX -> pub-XXXX (IAB spec wants no "ca-" prefix)
  const publisherId = adsenseId.replace(/^ca-/, "");

  const lines: string[] = [];
  if (publisherId) {
    // AdSense direct relationship. TAG-ID f08c47fec0942fa0 is Google's
    // ads.txt identifier per https://support.google.com/adsense/answer/7532444.
    lines.push(`google.com, ${publisherId}, DIRECT, f08c47fec0942fa0`);
  }
  // Future: add other ad networks (Media.net, Adsterra, etc) as RESELLER
  // entries from SiteConfig keys (ads_txt_extra) when needed.

  const body = lines.join("\n") + "\n";
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // ads.txt should be cacheable but refresh daily so admin edits propagate
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
