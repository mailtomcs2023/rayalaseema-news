import { NextResponse, type NextRequest } from "next/server";

// Admin-managed URL redirects (DB-backed). On each page request we look up the
// path in the redirect map and 308/307 to the target. The map is fetched from
// /api/redirects and cached in the edge isolate for 60s, so this adds at most
// ~one DB read per minute (not per request) and never blocks a page on error.

type RedirectMap = Record<string, { to: string; status: number }>;

let cache: { map: RedirectMap; ts: number } | null = null;

async function getRedirectMap(origin: string): Promise<RedirectMap> {
  if (cache && Date.now() - cache.ts < 60_000) return cache.map;
  try {
    const res = await fetch(`${origin}/api/redirects`, { cache: "no-store" });
    const map = res.ok ? ((await res.json()) as RedirectMap) : {};
    cache = { map, ts: Date.now() };
    return map;
  } catch {
    return cache?.map ?? {};
  }
}

// Clean paths the epaper.* subdomain serves at its root, mapped to the real
// /epaper routes inside apps/web. Add new epaper sub-pages here when created.
//   "/"           -> /epaper            (viewer home)
//   "/search"     -> /epaper/search
//   "/corrections"-> /epaper/corrections
const EPAPER_CLEAN = new Set(["/", "/search", "/corrections"]);

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname, origin } = url;
  const host = (req.headers.get("host") || "").toLowerCase();
  const isEpaperHost = host.startsWith("epaper.");
  // Permanent (308) in prod for SEO; temporary (307) in dev so browsers don't
  // hard-cache the redirect while you're wiring the subdomain up locally.
  const perma = process.env.NODE_ENV === "production";

  // ---- epaper.* subdomain: serve the /epaper subtree at the root ----------
  if (isEpaperHost) {
    // Links that still point at /epaper(/...) -> normalise to the clean root.
    if (pathname === "/epaper" || pathname.startsWith("/epaper/")) {
      const to = url.clone();
      to.pathname = pathname.slice("/epaper".length) || "/";
      return NextResponse.redirect(to, perma ? 308 : 307);
    }
    // Known epaper path -> rewrite to the real route; the URL bar stays clean.
    if (EPAPER_CLEAN.has(pathname)) {
      const to = url.clone();
      to.pathname = pathname === "/" ? "/epaper" : `/epaper${pathname}`;
      return NextResponse.rewrite(to);
    }
    // Anything else (site nav, articles, …) belongs to the main domain -> bounce.
    const mainHost = host.replace(/^epaper\./, "");
    const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
    return NextResponse.redirect(`${proto}://${mainHost}${pathname}${url.search}`, perma ? 308 : 307);
  }

  // ---- main domain: send /epaper(/...) to the subdomain (canonical) -------
  if (pathname === "/epaper" || pathname.startsWith("/epaper/")) {
    const base = process.env.NEXT_PUBLIC_EPAPER_URL;
    if (base) {
      const target = new URL(pathname.slice("/epaper".length) || "/", base);
      target.search = url.search;
      return NextResponse.redirect(target, perma ? 308 : 307);
    }
    // base unset (no subdomain configured) -> fall through, /epaper serves locally.
  }

  // ---- existing DB-backed redirect map ------------------------------------
  const map = await getRedirectMap(origin);
  const hit = map[pathname];
  if (hit && hit.to && hit.to !== pathname) {
    return NextResponse.redirect(new URL(hit.to, origin), hit.status === 307 ? 307 : 308);
  }
  return NextResponse.next();
}

export const config = {
  // Page paths only - skip _next internals, /api routes, and anything with a
  // file extension (assets, sitemap.xml, robots.txt, …).
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
