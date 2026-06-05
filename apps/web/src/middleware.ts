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

export async function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl;
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
