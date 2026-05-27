/** @type {import('next').NextConfig} */
// Spec #4 E4 (#223) — caching strategy:
//   - sitemap.xml / news-sitemap.xml / sitemap-index.xml / rss/* routes
//     use `export const revalidate = N` so the edge caches a single
//     copy per N seconds; the Prisma query no longer fires on every
//     crawler request.
//   - Full Cache Components opt-in (cacheLife profiles + cacheTag +
//     updateTag) deferred to a focused migration sprint — it changes
//     default rendering behaviour across the whole app and needs its
//     own QA pass. Tracked as a follow-up to E4.
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@rayalaseema/ui", "@rayalaseema/db", "@rayalaseema/seo-schema"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

module.exports = nextConfig;
