/** @type {import('next').NextConfig} */
// Spec #4 E4 (#223) - caching strategy:
//   - sitemap.xml / news-sitemap.xml / sitemap-index.xml / rss/* routes
//     use `export const revalidate = N` so the edge caches a single
//     copy per N seconds; the Prisma query no longer fires on every
//     crawler request.
//   - Full Cache Components opt-in (cacheLife profiles + cacheTag +
//     updateTag) deferred to a focused migration sprint - it changes
//     default rendering behaviour across the whole app and needs its
//     own QA pass. Tracked as a follow-up to E4.

// Security headers for the public web. Slightly looser than admin since
// reader-facing pages need third-party embeds (YouTube, social cards,
// AdSense once enabled). HSTS prod-only; clickjacking + sniffing locked
// down; Permissions-Policy denies invasive features by default.
const securityHeaders = [
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload",
        },
      ]
    : []),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  transpilePackages: ["@rayalaseema/ui", "@rayalaseema/db", "@rayalaseema/seo-schema"],
  // Inline critical CSS into the SSR'd HTML (Next 16). `optimizeCss`
  // was a Next 14 flag that ran Critters; Next 16 replaced it with
  // `inlineCss` which uses React 19's built-in stylesheet inlining +
  // moves the rest of the CSS out of the critical path. PSI's
  // "Render-blocking requests 1170ms" was the single biggest
  // remaining LCP gate after AdSense + GTM were deferred.
  experimental: {
    inlineCss: true,
  },
  images: {
    // Modern formats - Next.js negotiates the best one the browser
    // supports. AVIF is ~30% smaller than WebP and ~50% smaller than JPEG
    // at the same visual quality; major editorial-traffic win.
    formats: ["image/avif", "image/webp"],
    // 1-year CDN cache on the optimized variants. Source URL is part of
    // the cache key so swapping a featured image bypasses immediately.
    minimumCacheTTL: 60 * 60 * 24 * 365,
    // Quality whitelist (Next 16). Any `quality=` value not in this list
    // is rejected with 400, which is why we keep 75 (Next's historical
    // default) alongside our news-photo target of 55-60. PSI flagged
    // 221 KiB savings by dropping quality from 75 → 60 on the featured
    // carousel + district thumbs; news photos look identical at 60.
    qualities: [50, 55, 60, 65, 70, 75, 80, 85],
    remotePatterns: [
      // CDNs we've shipped with.
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "http", hostname: "localhost" },
      // Azure Blob - primary upload destination. Allows any account name
      // under the `*.blob.core.windows.net` wildcard so deploys to a new
      // storage account don't need a config change.
      { protocol: "https", hostname: "**.blob.core.windows.net" },
      // Free-image-search picks (Pexels, Pixabay, iStock CDN). When the
      // editor inserts an image via the search modal it lands as one of
      // these direct URLs.
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "pixabay.com" },
      { protocol: "https", hostname: "cdn.pixabay.com" },
      { protocol: "https", hostname: "media.istockphoto.com" },
      // Sakshi / Eenadu / common wire-image hosts that the auto-fetch
      // pipeline ingests as og:image. Add more here if a publisher gets
      // through the scraper but their image host is blocked.
      { protocol: "https", hostname: "**.gumlet.io" },
      { protocol: "https", hostname: "**.akamaized.net" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.eenadu.net" },
      { protocol: "https", hostname: "**.sakshi.com" },
      // Google image-search thumbnail CDNs - editor pastes these via the
      // image-search modal. Without the whitelist next/image 400s the
      // request, leaving the article hero broken until we rehost it.
      { protocol: "https", hostname: "encrypted-tbn0.gstatic.com" },
      { protocol: "https", hostname: "encrypted-tbn1.gstatic.com" },
      { protocol: "https", hostname: "encrypted-tbn2.gstatic.com" },
      { protocol: "https", hostname: "encrypted-tbn3.gstatic.com" },
      { protocol: "https", hostname: "**.gstatic.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      // Common Telugu/Indian news image hosts the editor pastes via
      // image-search or external article ingest. ensureBlobHosted now
      // rehosts on save - this list keeps already-saved external URLs
      // from 400ing in next/image until backfill runs.
      { protocol: "https", hostname: "**.cricbuzz.com" },
      { protocol: "https", hostname: "**.hmtvlive.com" },
      { protocol: "https", hostname: "**.10tv.in" },
      { protocol: "https", hostname: "**.asianetnews.com" },
      { protocol: "https", hostname: "**.telugutimes.net" },
      { protocol: "https", hostname: "**.siasat.com" },
      { protocol: "https", hostname: "**.t2blive.com" },
      { protocol: "https", hostname: "**.langimg.com" },
      { protocol: "https", hostname: "**.probatsman.com" },
      { protocol: "https", hostname: "**.deccanchronicle.com" },
      { protocol: "https", hostname: "**.licdn.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  async headers() {
    // The page-builder template editor lives on the admin subdomain and
    // iframes the live preview from THIS (web) origin: admin.rayalaseemanews.com
    // framing rayalaseemanews.com is cross-origin, so a blanket
    // X-Frame-Options: SAMEORIGIN blocks it (blank frame). For the preview
    // route only, drop X-Frame-Options and use CSP frame-ancestors (the modern,
    // multi-origin replacement) to allow the admin editor - prod + local dev.
    // Every other route keeps SAMEORIGIN unchanged.
    const previewHeaders = [
      ...securityHeaders.filter((h) => h.key !== "X-Frame-Options"),
      {
        key: "Content-Security-Policy",
        value:
          "frame-ancestors 'self' https://admin.rayalaseemanews.com http://localhost:3001",
      },
    ];
    return [
      { source: "/page-builder/preview/:path*", headers: previewHeaders },
      // Negative lookahead so this blanket rule does NOT also match the preview
      // route above (otherwise both header sets would apply and the SAMEORIGIN
      // here would re-block the iframe).
      { source: "/((?!page-builder/preview).*)", headers: securityHeaders },
    ];
  },
  async redirects() {
    // Categories moved from /category/<slug> to bare root slugs (Eenadu-style:
    // /business, /sports). Permanent (308) redirect preserves SEO equity for
    // every already-indexed /category/* URL. RSS lives at /rss/category/* and
    // is unaffected (different prefix).
    return [
      { source: "/category/:slug", destination: "/:slug", permanent: true },
      // Districts also moved to bare root slugs (/kurnool). The :slug pattern is
      // single-segment, so article permalinks /[district]/[constituency]/...
      // (multi-segment) are unaffected.
      { source: "/district/:slug", destination: "/:slug", permanent: true },
    ];
  },
};

module.exports = nextConfig;
