// Spec #4 D5 (#218) - IndexNow ownership verification file.
//
// The IndexNow protocol requires the publisher to prove control of the host
// by serving a small file containing the key at /<key>.txt or
// /.well-known/<key>.txt. We use the .well-known variant because static
// hosts often have a separate served-root for it.
//
// We don't hard-code the key - it's stored in SiteConfig.indexnow_key
// (added in Phase A4 #195). The admin sets it via /settings → SEO & Analytics.
// Any request to /.well-known/<X> returns the key plain-text only when X
// matches the configured key (with or without .txt suffix), otherwise 404.
// This means rotating the key is a SiteConfig edit + a fresh IndexNow ping
// - no redeploy needed.

import { prisma } from "@rayalaseema/db";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key: requested } = await ctx.params;
  const config = await prisma.siteConfig.findUnique({ where: { key: "indexnow_key" } });
  const configured = config?.value?.trim();
  if (!configured) {
    return new Response("IndexNow key not configured", { status: 404 });
  }
  // Accept both "<key>" and "<key>.txt".
  const normalized = requested.endsWith(".txt") ? requested.slice(0, -4) : requested;
  if (normalized !== configured) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(configured, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
