/**
 * POST /api/auto-fetch-pti
 *
 * Pulls a time window from the PTI editorial wire, maps each story's
 * (category, subcategory) onto an internal Content category, runs the
 * shared 3-step Eenadu-grade pipeline to translate + format, and creates
 * DRAFT Content rows.
 *
 * Body (all optional):
 *   {
 *     from?: ISO timestamp        // default: now - 24h
 *     to?:   ISO timestamp        // default: now
 *     ptiCategories?: string[]    // ["NATIONAL","BUSINESS",...] - allowlist
 *     limit?: number              // max stories to import (default 25)
 *     forceReimport?: boolean
 *   }
 *
 * PTI's API has no keyword search and no per-category endpoint - one pull
 * returns everything in the window. We filter + bucket client-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError } from "@/lib/api-utils";
import {
  ArticleBlockedByFilter,
  RawArticle,
  importOneArticle,
  loadImportPrelude,
} from "@/lib/news-import";

const PTI_CENTERCODE = process.env.PTI_CENTERCODE;

// Subcategory tokens that PTI's doc says are internal-only - drop any
// article whose subcategory list contains ONLY these.
const NOISE_SUBCATS = new Set(["GEN", "ESPL", "DSB"]);

// PTI vocabulary - mirrors the fetch-news route. Caller's
// ptiCategories[] may contain either top-level category names
// (BUSINESS, SPORTS, ...) or subcategory tokens (CRI, LGL, NRG, ...).
// We bucket each entry by membership.
const KNOWN_TOP_CATS = new Set([
  "NATIONAL", "NATION", "BUSINESS", "SPORTS",
  "FOREIGN", "INTERNATIONAL", "INDIA",
]);
const KNOWN_SUBCATS = new Set([
  "NAT", "INT", "SPO", "CRI", "COM", "ECO",
  "LGL", "ENT", "NRG", "ERG", "WRG", "SRG",
]);

// Map PTI subcategory token → our internal Content.category slug. First
// recognised token wins. Unknown tokens fall through; the article gets
// bucketed by PTI top-level `category` instead.
const SUBCAT_TO_SLUG: Record<string, string> = {
  NAT: "politics",
  INT: "international",
  SPO: "sports",
  CRI: "sports",
  COM: "business",
  ECO: "business",
  LGL: "crime",
  ENT: "entertainment",
  NRG: "district-news",
  ERG: "district-news",
  WRG: "district-news",
  SRG: "district-news",
};

// PTI top-level category → our slug (used when subcategory has no match).
const TOPLEVEL_TO_SLUG: Record<string, string> = {
  NATIONAL: "politics",
  NATION: "politics",
  INDIA: "national",
  FOREIGN: "international",
  INTERNATIONAL: "international",
  BUSINESS: "business",
  SPORTS: "sports",
};

function mapPtiToInternalSlug(category: string, subcategory: string): string {
  const subs = String(subcategory || "").trim().split(/\s+/).filter(Boolean);
  for (const s of subs) {
    const slug = SUBCAT_TO_SLUG[s.toUpperCase()];
    if (slug) return slug;
  }
  const top = String(category || "").trim().toUpperCase();
  return TOPLEVEL_TO_SLUG[top] || "national";
}

function stripHtml(s: string): string {
  return (s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// PTI's "Wednesday, Jan 24, 2024 12:11:22" → ISO. IST, no offset in feed.
function parsePtiPublishedAt(raw: string): string {
  if (!raw) return new Date().toISOString();
  const cleaned = raw.replace(/^[A-Za-z]+,\s*/, "").trim();
  const d = new Date(`${cleaned} +05:30`);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// PTI requires "yyyy/MM/dd HH:mm:ss" in IST with no offset.
function toPtiTimeString(d: Date): string {
  const ist = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}/${p(ist.getUTCMonth() + 1)}/${p(ist.getUTCDate())} ${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}:${p(ist.getUTCSeconds())}`;
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  if (!PTI_CENTERCODE) {
    return NextResponse.json({ error: "PTI_CENTERCODE not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    from?: string;
    to?: string;
    ptiCategories?: string[];
    limit?: number;
    forceReimport?: boolean;
  };

  const now = new Date();
  const fromDate = body.from ? new Date(body.from) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const toDate = body.to ? new Date(body.to) : now;
  const limit = Math.min(Math.max(body.limit || 25, 1), 100);
  const forceReimport = !!body.forceReimport;

  // Split the caller's allowlist into top-level vs subcategory buckets.
  // An empty allowlist means "all PTI stories in window".
  const wantTopCats = new Set<string>();
  const wantSubcats = new Set<string>();
  for (const raw of body.ptiCategories || []) {
    const v = String(raw || "").toUpperCase().trim();
    if (!v) continue;
    if (KNOWN_SUBCATS.has(v)) wantSubcats.add(v);
    else if (KNOWN_TOP_CATS.has(v)) wantTopCats.add(v);
    else wantTopCats.add(v); // unknown - default to top-level so the route stays open to new PTI categories
  }
  const hasFilter = wantTopCats.size > 0 || wantSubcats.size > 0;

  // Pull PTI window.
  const url = `https://editorial.pti.in/ptiapi/webservice1.asmx/JsonFile1?centercode=${encodeURIComponent(PTI_CENTERCODE)}&FromTime=${encodeURIComponent(toPtiTimeString(fromDate))}&EndTime=${encodeURIComponent(toPtiTimeString(toDate))}`;
  let raw: any;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      return NextResponse.json({ error: `PTI ${res.status}` }, { status: 502 });
    }
    raw = await res.json();
  } catch (e: any) {
    return NextResponse.json({ error: `PTI fetch failed: ${e?.message || e}` }, { status: 502 });
  }
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.d) ? raw.d : Array.isArray(raw?.results) ? raw.results : [];

  // Filter noise + optional category allowlist; cap at limit.
  const filtered: Array<{ pti: any; slug: string }> = [];
  for (const r of list) {
    const subcats = String(r.subcategory || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => s.toUpperCase());
    const meaningful = subcats.filter((s) => !NOISE_SUBCATS.has(s));
    if (subcats.length > 0 && meaningful.length === 0) continue;
    const topCat = String(r.category || "").toUpperCase();
    if (hasFilter) {
      const topHit = wantTopCats.size > 0 && wantTopCats.has(topCat);
      const subHit = wantSubcats.size > 0 && meaningful.some((s) => wantSubcats.has(s));
      if (!topHit && !subHit) continue;
    }
    if (!r.Headline || !r.story || !r.FileName) continue;
    filtered.push({ pti: r, slug: mapPtiToInternalSlug(r.category, r.subcategory) });
    if (filtered.length >= limit) break;
  }

  if (filtered.length === 0) {
    return NextResponse.json({
      success: true,
      totalPublished: 0,
      totalFetched: list.length,
      message: list.length === 0 ? "PTI returned no stories in window" : "All stories filtered out (noise/allowlist)",
      results: [],
    });
  }

  // Shared prelude - admin author, categorySlug→id map, dedup sets.
  let prelude;
  try {
    prelude = await loadImportPrelude();
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Prelude load failed" }, { status: 500 });
  }
  const { admin, categoryMap, existingSlugs, existingSourceSet } = prelude;

  // Cache constituency lookups per district slug across the run.
  const constituencyCache = new Map<string, string | undefined>();
  async function resolveConstituency(districtSlug: string): Promise<string | undefined> {
    if (constituencyCache.has(districtSlug)) return constituencyCache.get(districtSlug);
    const district = await prisma.district.findUnique({
      where: { slug: districtSlug },
      include: { constituencies: { take: 1 } },
    });
    const cid = district?.constituencies[0]?.id;
    constituencyCache.set(districtSlug, cid);
    return cid;
  }

  // Run imports.
  const perCategory: Record<string, { fetched: number; published: number; blocked: number; blockedCats: Set<string> }> = {};
  let totalPublished = 0;
  for (const { pti, slug } of filtered) {
    const bucket = (perCategory[slug] ||= { fetched: 0, published: 0, blocked: 0, blockedCats: new Set() });
    bucket.fetched++;

    // PTI's `link` is the generic www.ptinews.com root - useless for
    // dedup. Synthesize a unique pseudo-URL from FileName so the
    // Content.sourceUrl unique index does its job.
    const syntheticLink = `https://editorial.pti.in/pti/${encodeURIComponent(pti.FileName)}`;

    const storyText = stripHtml(String(pti.story || ""));
    const article: RawArticle = {
      article_id: String(pti.FileName),
      title: String(pti.Headline || "").trim(),
      description: storyText.slice(0, 500),
      // Pass plain text to the pipeline so the AI extractor sees clean
      // copy. Keeping <p> tags here would leak markup into the
      // extract-step prompt.
      content: storyText,
      image_url: null,
      link: syntheticLink,
      source_id: "PTI",
      pubDate: parsePtiPublishedAt(pti.PublishedAt),
    };

    const categoryId = categoryMap[slug] || categoryMap["national"];
    if (!categoryId) continue;

    // District-prefixed slug carries constituency tagging - none of our
    // mapped slugs are district-prefixed, but keep the hook for future.
    let constituencyId: string | undefined;
    if (slug.startsWith("district-")) {
      constituencyId = await resolveConstituency(slug.replace("district-", ""));
    }

    try {
      const ok = await importOneArticle(article, categoryId, constituencyId, existingSourceSet, existingSlugs, admin.id, forceReimport);
      if (ok) {
        bucket.published++;
        totalPublished++;
      }
    } catch (e) {
      if (e instanceof ArticleBlockedByFilter) {
        bucket.blocked++;
        for (const c of e.categories) bucket.blockedCats.add(c);
      } else {
        throw e;
      }
    }
    // Same per-article delay as auto-fetch to avoid Azure rate-limit thrash.
    await new Promise((r) => setTimeout(r, 1000));
  }

  const results = Object.entries(perCategory).map(([category, v]) => ({
    category,
    fetched: v.fetched,
    published: v.published,
    blocked: v.blocked || undefined,
    blockedReason: v.blocked > 0 && v.blockedCats.size > 0 ? [...v.blockedCats].join(", ") : undefined,
  }));

  return NextResponse.json({
    success: true,
    totalPublished,
    totalFetched: list.length,
    totalConsidered: filtered.length,
    window: { from: fromDate.toISOString(), to: toDate.toISOString() },
    results,
    message: `PTI: imported ${totalPublished} of ${filtered.length} considered (window ${filtered.length}/${list.length} after filters)`,
  });
}
