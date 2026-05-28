/** @type {import('next').NextConfig} */

// Security headers - applied to every route. Chosen to be safe defaults that
// don't break the admin UI's current behaviour:
//   - CSP omitted intentionally (next/script + inline styles + 3rd-party
//     embeds need per-route nonces to land cleanly; tracked for a later PR).
//   - HSTS only in production so localhost can still serve over http.
//   - frame-ancestors blocks the admin from being iframed (clickjacking).
const securityHeaders = [
  // Tells browsers HTTPS only, for 1 year, including subdomains. Skipped on
  // dev so http://localhost still works.
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload",
        },
      ]
    : []),
  // No MIME sniffing - prevents stored images from being interpreted as JS.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Same-origin frame embedding only (clickjacking guard).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Send the Referer header only when same-origin OR cross-origin downgrades
  // to less-private info. Keeps internal navigations diagnosable without
  // leaking full URLs to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Deny camera / microphone / geolocation by default - admin has no
  // legitimate need for any of these. Add specific origins here if a
  // future feature needs them.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Allow cross-origin loaders + cross-origin embeds the admin actually
  // uses (Azure Blob images, Google Fonts). The default `cross-origin` is
  // permissive but explicit.
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  // (Next.js 16+ removed the inline `eslint` config key — `next lint`
  // is no longer the supported way to run ESLint. Configure via
  // .eslintrc.json + `bun run lint` instead.)
  transpilePackages: ["@rayalaseema/ui", "@rayalaseema/db", "@rayalaseema/seo-schema", "@rayalaseema/nlp"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  async headers() {
    return [
      {
        // Apply to every path. /_next/* + /favicon.ico already have their
        // own Cache-Control so the security headers are additive.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Bundle analyzer - opt-in via env. Run `bun run analyze` (script defined
// below in package.json) to get an interactive treemap of the client +
// server bundles. Useful for catching accidentally-included heavy deps.
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

module.exports = withBundleAnalyzer(nextConfig);
