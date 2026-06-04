// On-demand cross-app menu revalidation (Spec #3 E1). apps/admin and apps/web
// are separate Next.js processes, so the admin publish route's revalidateTag()
// can't reach this app's menu cache. The admin publish route POSTs here after a
// successful publish to bust the "menu" tag inside THIS process, so the new
// menu shows up on the next request instead of waiting out the 15s TTL.
//
// Auth: shared secret in MENU_REVALIDATE_SECRET (set the same value in both
// apps for prod). If the env is unset (local dev), the call is allowed so it
// works out of the box.
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

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
  revalidateTag("menu", "global");
  return NextResponse.json({ ok: true, revalidated: "menu" });
}
