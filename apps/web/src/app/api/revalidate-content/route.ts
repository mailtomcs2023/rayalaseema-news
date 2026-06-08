// On-demand cross-app CONTENT revalidation. apps/admin and apps/web are
// separate Next.js processes, so a revalidatePath() in the admin publish route
// can't reach this app's page cache. After an article is published the admin
// POSTs here so the affected public pages refresh immediately instead of
// waiting out their ISR TTL (the homepage is cached 30s, hubs/articles vary).
//
// The homepage "/" is ALWAYS revalidated (it surfaces the latest articles);
// any extra `paths` in the body (the article's own URL, its district /
// constituency / category hubs) are revalidated too.
//
// Auth: shared secret in MENU_REVALIDATE_SECRET (already set in both apps for
// prod - reused so no new env var). If unset (local dev) the call is allowed.
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const secret = process.env.MENU_REVALIDATE_SECRET;
  if (secret) {
    const provided =
      req.headers.get("x-revalidate-secret") ||
      new URL(req.url).searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let paths: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.paths)) {
      paths = body.paths.filter((p: unknown): p is string => typeof p === "string" && p.startsWith("/"));
    }
  } catch {
    /* no/invalid body - just revalidate the homepage */
  }

  // Always refresh the homepage; de-dupe the rest.
  const all = Array.from(new Set(["/", ...paths]));
  for (const p of all) {
    try {
      revalidatePath(p);
    } catch {
      /* an individual bad path must not fail the whole call */
    }
  }
  return NextResponse.json({ ok: true, revalidated: all });
}
