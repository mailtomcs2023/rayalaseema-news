// 301-redirects legacy article URLs to the new geo-hierarchy pattern.
// See docs/superpowers/specs/2026-05-26-seo-rayalaseema-design.md (Phase A0).
//
// Behaviour:
// - URL_PATTERN=legacy → middleware passes through; legacy /article/<slug>
//   route renders normally. Rollback escape hatch for the 30-day post-cutover
//   window.
// - URL_PATTERN=new (default) → /article/<slug> and /article/<slug>/amp are
//   301-redirected to the canonical /[district]/[constituency]/<slug>-<id>.
//   AMP traffic lands on the canonical HTML — AMP variant deleted in this
//   same migration (AMP is dead since 2021; see Phase A0 decision #9).
//
// Runtime: Node (not edge) so we can hit Prisma directly. Volume on this path
// is low (only legacy URLs from Google's index pre-migration), so cold-start
// cost is acceptable. In-memory cache prevents repeat DB hits within the same
// process lifetime.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@rayalaseema/db";
import { articleHref } from "@/lib/article-href";

export const config = {
  matcher: ["/article/:path*"],
};

// Bare type so we don't pull in a Prisma type at middleware load time.
type ArticleForHref = {
  id: string;
  slug: string | null;
  constituency: { slug: string; district: { slug: string } } | null;
};

const CACHE = new Map<string, { href: string; expires: number }>();
const TTL_MS = 5 * 60 * 1000; // 5 min

async function lookupHref(slug: string): Promise<string | null> {
  const now = Date.now();
  const cached = CACHE.get(slug);
  if (cached && cached.expires > now) return cached.href;
  const row = (await prisma.content.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      type: true,
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
  })) as (ArticleForHref & { type: string }) | null;
  if (!row || row.type !== "ARTICLE" || !row.slug) return null;
  const href = articleHref(row);
  CACHE.set(slug, { href, expires: now + TTL_MS });
  return href;
}

export async function middleware(req: NextRequest) {
  // Rollback flag — when set to "legacy", let the request fall through to the
  // existing /article/[slug] page so we can quickly restore old behaviour
  // without re-deploying middleware changes.
  if (process.env.URL_PATTERN === "legacy") return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  // Match /article/<slug> and /article/<slug>/amp. Anything deeper falls
  // through (e.g. a hypothetical /article/<slug>/comments would 404 normally).
  const m = pathname.match(/^\/article\/([^/]+?)(\/amp)?\/?$/);
  if (!m) return NextResponse.next();

  const slug = decodeURIComponent(m[1]);
  let newPath: string | null = null;
  try {
    newPath = await lookupHref(slug);
  } catch (err) {
    // If the DB is unreachable we'd rather render the legacy page than 5xx,
    // so we pass through. The legacy route still exists and is functional.
    console.error("[middleware] articleHref lookup failed:", err);
    return NextResponse.next();
  }
  if (!newPath) return NextResponse.next(); // 404s render on the legacy route

  const url = req.nextUrl.clone();
  url.pathname = newPath;
  url.search = search; // preserve query string (utm_* etc)
  return NextResponse.redirect(url, 301);
}
