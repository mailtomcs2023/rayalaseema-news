// Fire-and-forget on-demand revalidation of the PUBLIC web app (apps/web).
//
// apps/web is a separate Next.js process with its own ISR page cache, so a
// revalidatePath() here in admin can't reach it. After a publish we POST the
// affected public paths to apps/web's /api/revalidate-content endpoint so they
// refresh immediately instead of waiting out the page's ISR TTL (home = 30s).
//
// Mirrors the proven menu-publish → /api/revalidate-menu pattern. Never throws
// and never blocks the caller: a slow/unreachable web app must not break a
// publish, and the ISR TTL is the safety net (the page still refreshes within
// its window even if this ping is lost).

/**
 * Ping the web app to revalidate the given public paths. The homepage ("/") is
 * always revalidated by the endpoint, so callers only pass the extra paths
 * (article URL, district/constituency/category hubs). Pass nothing to refresh
 * just the homepage.
 */
export function pingWebRevalidate(paths: string[] = []): void {
  const siteUrl = process.env.SITE_URL || "http://localhost:3000";
  // Fire-and-forget: don't await, don't surface errors to the caller.
  void fetch(`${siteUrl}/api/revalidate-content`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-revalidate-secret": process.env.MENU_REVALIDATE_SECRET || "",
    },
    body: JSON.stringify({ paths }),
    // Don't let a slow/unreachable web app hang the publish response.
    signal: AbortSignal.timeout(3000),
  }).catch(() => {
    /* non-fatal - the page's ISR TTL still refreshes it within its window */
  });
}
