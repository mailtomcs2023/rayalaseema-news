// GET /api/images/search?q=...&provider=pexels|google
//
// Free image search for the editor's "Find image" panel. Two providers:
//
//   pexels  — CC0-style license, safe for commercial reuse, always-on.
//             Requires PEXELS_API_KEY env.
//   google  — Google Custom Search JSON API. Wider catalog but most results
//             are COPYRIGHTED — surfaced as a research tool only. Requires
//             GOOGLE_CSE_KEY + GOOGLE_CSE_ID env.
//
// Returns: { provider, results: [{ thumbUrl, fullUrl, sourceUrl, photographer, license }] }
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

type Hit = {
  thumbUrl: string;
  fullUrl: string;
  sourceUrl: string | null;
  photographer: string | null;
  license: string;
};

async function searchPexels(query: string): Promise<Hit[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("PEXELS_API_KEY not configured");
  const url = `https://api.pexels.com/v1/search?per_page=20&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.photos || []).map((p: any) => ({
    thumbUrl: p.src?.medium || p.src?.small,
    fullUrl: p.src?.large2x || p.src?.large || p.src?.original,
    sourceUrl: p.url,
    photographer: p.photographer || null,
    license: "Pexels (free for commercial use, attribution appreciated)",
  }));
}

async function searchGoogle(query: string): Promise<Hit[]> {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) throw new Error("GOOGLE_CSE_KEY / GOOGLE_CSE_ID not configured");
  const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&searchType=image&num=10&safe=active&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) {
    // Surface Google's actual error message — common cases:
    //   "API key not valid" -> wrong / unset GOOGLE_CSE_KEY
    //   "Custom Search API has not been used in project ..." -> API not enabled
    //   "Invalid Value" -> cx (engine ID) is wrong
    //   "Image search is not enabled" -> engine has image search toggle OFF
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message || JSON.stringify(body).slice(0, 300);
    } catch {
      detail = (await res.text()).slice(0, 300);
    }
    throw new Error(`Google CSE ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return (data.items || []).map((i: any) => ({
    thumbUrl: i.image?.thumbnailLink || i.link,
    fullUrl: i.link,
    sourceUrl: i.image?.contextLink || null,
    photographer: i.displayLink || null,
    license: "⚠ COPYRIGHT UNKNOWN — verify license before publishing",
  }));
}

export async function GET(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "CHIEF_SUB_EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const provider = (searchParams.get("provider") || "pexels").toLowerCase();
    if (!q) return NextResponse.json({ error: "Query required" }, { status: 400 });
    if (q.length > 200) return NextResponse.json({ error: "Query too long" }, { status: 400 });

    let results: Hit[] = [];
    if (provider === "google") {
      results = await searchGoogle(q);
    } else {
      results = await searchPexels(q);
    }
    return NextResponse.json({ provider, results });
  } catch (e: any) {
    // Surface key-missing errors at 503 so the UI can prompt for env setup.
    if (/not configured/i.test(e?.message || "")) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    // Image search upstream errors are not sensitive — surface the message so
    // the admin can see "API not enabled / wrong cx / image search off" etc.
    console.error("[images/search]", e);
    return NextResponse.json({ error: e?.message || "Image search failed" }, { status: 502 });
  }
}
