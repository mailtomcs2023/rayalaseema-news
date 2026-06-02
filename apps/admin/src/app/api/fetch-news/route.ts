import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError } from "@/lib/api-utils";
import { buildSlugFromTitle, sanitizeSlug } from "@/lib/slug";
import { uploadImageFromUrl } from "@/lib/blob";

const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;
const PTI_CENTERCODE = process.env.PTI_CENTERCODE;

// PTI subcategory tokens that are internal-only per the PTI API doc -
// articles whose subcategory contains ONLY these are dropped.
const PTI_NOISE_SUBCATS = new Set(["GEN", "ESPL", "DSB"]);

// PTI vocabulary, used to disambiguate the `category` query param. If a
// caller sends ?category=CRI we filter by subcategory token; if they
// send ?category=BUSINESS we filter by top-level category. Both are
// case-insensitive on the wire.
const PTI_TOP_CATEGORIES = new Set([
  "NATIONAL", "NATION", "BUSINESS", "SPORTS",
  "FOREIGN", "INTERNATIONAL", "INDIA",
]);
const PTI_SUBCATEGORIES = new Set([
  "NAT", "INT", "SPO", "CRI", "COM", "ECO",
  "LGL", "ENT", "NRG", "ERG", "WRG", "SRG",
]);

// Map PTI's "Wednesday, Jan 24, 2024 12:11:22" timestamp to ISO. PTI runs
// on IST (Asia/Kolkata) but the string carries no offset, so we append
// +05:30 to keep downstream new Date() consumers honest.
function parsePtiPublishedAt(raw: string): string {
  if (!raw) return new Date().toISOString();
  // Strip the leading day-name + comma; Date() can parse the rest.
  const cleaned = raw.replace(/^[A-Za-z]+,\s*/, "").trim();
  const d = new Date(`${cleaned} +05:30`);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// Strip HTML tags + collapse whitespace. Used to derive a plain-text
// description from PTI's <p>-wrapped story body.
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

// GET /api/fetch-news?provider=newsdata|googlenews|pti&q=...
//
// Three providers shipped:
//   newsdata   - NewsData.io REST API. Requires NEWSDATA_API_KEY.
//   googlenews - Google News RSS endpoint. No key required, no rate limit
//                docs but treated as zero-trust public surface.
//   pti        - PTI editorial wire. Requires PTI_CENTERCODE. PTI's API
//                has no keyword search - we pull a time window and filter
//                title/body for `q` after fetch. Optional `from`/`to`
//                ISO timestamps; default is the last 24h.
//
// All return the same shape: { articles: [{ externalId, title, description,
// imageUrl, sourceUrl, source, language, publishedAt, keywords }] }. POST
// /api/fetch-news (further down this file) imports a result row as a draft.
export async function GET(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  const { searchParams } = new URL(req.url);
  const provider = (searchParams.get("provider") || "newsdata").toLowerCase();
  const query = searchParams.get("q") || "Rayalaseema OR Kurnool OR Anantapur OR Kadapa OR Tirupati OR Chittoor";
  const language = searchParams.get("language") || "te,en";
  const size = Math.min(parseInt(searchParams.get("size") || "10"), 20);

  try {
    if (provider === "googlenews") {
      // Google News RSS - no auth, no key. hl/gl/ceid pick UI lang + region.
      // We default to Telugu; UI can switch to English via ?language=en.
      const hl = language.startsWith("te") ? "te" : "en-IN";
      const ceid = language.startsWith("te") ? "IN:te" : "IN:en";
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=IN&ceid=${ceid}`;
      const res = await fetch(url, { headers: { "User-Agent": "RayalaseemaNews/1.0 (+admin)" } });
      if (!res.ok) return NextResponse.json({ error: `Google News ${res.status}` }, { status: 502 });
      const xml = await res.text();

      // Lightweight RSS parser - Google News RSS is well-formed XML so a few
      // anchored regexes are fine here (no need to pull in a full DOM lib).
      const items: any[] = [];
      const itemRe = /<item>([\s\S]*?)<\/item>/g;
      let m: RegExpExecArray | null;
      while ((m = itemRe.exec(xml)) && items.length < size) {
        const block = m[1];
        const pick = (re: RegExp) => { const x = block.match(re); return x ? x[1].trim() : ""; };
        const decode = (s: string) =>
          s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
           .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
           .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
        const title = decode(pick(/<title>([\s\S]*?)<\/title>/));
        const link = decode(pick(/<link>([\s\S]*?)<\/link>/));
        const pubDate = pick(/<pubDate>([\s\S]*?)<\/pubDate>/);
        const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
        const source = sourceMatch ? decode(sourceMatch[1]) : "";
        const desc = decode(pick(/<description>([\s\S]*?)<\/description>/)).replace(/<[^>]+>/g, " ").trim();
        items.push({
          externalId: link,
          title, description: desc,
          content: null,
          imageUrl: null,
          sourceUrl: link,
          source,
          language: hl,
          category: "general",
          publishedAt: pubDate,
          keywords: [],
        });
      }

      // Google News RSS doesn't include images. Scrape og:image / twitter:image
      // from each result's article URL in parallel. Per-item 4s timeout keeps
      // the total bounded under the proxy limit even when one publisher is slow.
      // Results without an image still come back - image is just null.
      await Promise.all(items.map(async (item) => {
        if (!item.sourceUrl) return;
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 4000);
          const r = await fetch(item.sourceUrl, {
            redirect: "follow",
            headers: { "User-Agent": "Mozilla/5.0 (compatible; RayalaseemaNews/1.0)" },
            signal: ctrl.signal,
          });
          clearTimeout(t);
          if (!r.ok) return;
          // Only read the first ~80KB of HTML - meta tags live in <head>.
          const reader = r.body?.getReader();
          if (!reader) return;
          let html = "";
          const dec = new TextDecoder();
          for (let i = 0; i < 10; i++) {
            const { done, value } = await reader.read();
            if (done) break;
            html += dec.decode(value, { stream: true });
            if (html.length > 80_000) break;
          }
          reader.cancel().catch(() => {});
          const pickMeta = (re: RegExp) => { const x = html.match(re); return x ? x[1].trim() : null; };
          const img =
            pickMeta(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
            pickMeta(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
            pickMeta(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
          if (img) item.imageUrl = img;
        } catch { /* timeout / network / parse - leave imageUrl null */ }
      }));
      return NextResponse.json({ total: items.length, articles: items, provider: "googlenews" });
    }

    if (provider === "pti") {
      if (!PTI_CENTERCODE) return NextResponse.json({ error: "PTI_CENTERCODE not configured" }, { status: 503 });

      // Time window. Default = last 24h. Caller may override with ISO
      // timestamps via `from` and `to`. PTI expects "yyyy/MM/dd HH:mm:ss"
      // in IST with no offset; we convert here.
      const toIsoIst = (d: Date) => {
        const ist = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
        const p = (n: number, w = 2) => String(n).padStart(w, "0");
        return `${ist.getUTCFullYear()}/${p(ist.getUTCMonth() + 1)}/${p(ist.getUTCDate())} ${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}:${p(ist.getUTCSeconds())}`;
      };
      const now = new Date();
      const fromRaw = searchParams.get("from");
      const toRaw = searchParams.get("to");
      const fromDate = fromRaw ? new Date(fromRaw) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const toDate = toRaw ? new Date(toRaw) : now;
      const fromTime = toIsoIst(fromDate);
      const endTime = toIsoIst(toDate);

      const url = `https://editorial.pti.in/ptiapi/webservice1.asmx/JsonFile1?centercode=${encodeURIComponent(PTI_CENTERCODE)}&FromTime=${encodeURIComponent(fromTime)}&EndTime=${encodeURIComponent(endTime)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return NextResponse.json({ error: `PTI ${res.status}` }, { status: 502 });

      // PTI sometimes wraps the array in a parent object - handle both.
      const raw = await res.json();
      const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.d) ? raw.d : Array.isArray(raw?.results) ? raw.results : [];

      // category param accepts either a top-level PTI category (BUSINESS,
      // SPORTS, NATIONAL, ...) or a finer-grained subcategory token (CRI,
      // LGL, ENT, NRG/ERG/WRG/SRG, ...). We disambiguate against the
      // known-vocabulary sets so the UI can mix both in one dropdown.
      const filterVal = (searchParams.get("category") || "").trim().toUpperCase();
      let wantTopCat = "";
      let wantSubcat = "";
      if (filterVal) {
        if (PTI_SUBCATEGORIES.has(filterVal)) wantSubcat = filterVal;
        else if (PTI_TOP_CATEGORIES.has(filterVal)) wantTopCat = filterVal;
        else wantTopCat = filterVal; // unknown - treat as top-level, lets PTI add new categories without code changes
      }
      // `q` post-filter. Caller sends explicit q to narrow; we honour it
      // as token OR-match against title + description. PTI's API has no
      // server-side q so this happens client-side.
      const rawQ = (searchParams.get("q") || "").trim().toLowerCase();
      const qTokens = rawQ.length
        ? rawQ.split(/\s+or\s+/).map((t) => t.trim()).filter(Boolean)
        : [];

      const items = list
        .map((r: any) => {
          const subcats = String(r.subcategory || "")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((s) => s.toUpperCase());
          const meaningful = subcats.filter((s) => !PTI_NOISE_SUBCATS.has(s));
          if (subcats.length > 0 && meaningful.length === 0) return null;
          const storyHtml = String(r.story || "");
          const text = stripHtml(storyHtml);
          return {
            externalId: String(r.FileName || ""),
            title: String(r.Headline || r.slug || "").trim(),
            description: text.slice(0, 240),
            content: storyHtml,
            imageUrl: null,
            // PTI's `link` is the generic www.ptinews.com root - useless
            // for dedup. Synthesize a unique pseudo-URL from FileName so
            // the Content.sourceUrl unique index does its job.
            sourceUrl: r.FileName ? `https://editorial.pti.in/pti/${encodeURIComponent(r.FileName)}` : "",
            source: "PTI",
            language: "en",
            category: String(r.category || "general").toLowerCase(),
            ptiTopCategory: String(r.category || "").toUpperCase(),
            ptiSubcategories: meaningful,
            publishedAt: parsePtiPublishedAt(r.PublishedAt),
            keywords: [
              ...(r.Priority ? [String(r.Priority)] : []),
              ...meaningful,
            ],
            byline: r.Byline || "",
            edNote: r.EDNote || "",
          };
        })
        .filter((x): x is NonNullable<typeof x> => !!x && !!x.title && !!x.externalId)
        .filter((x) => !wantTopCat || x.ptiTopCategory === wantTopCat)
        .filter((x) => !wantSubcat || x.ptiSubcategories.includes(wantSubcat))
        .filter((x) => {
          if (!qTokens.length) return true;
          const hay = `${x.title} ${x.description}`.toLowerCase();
          return qTokens.some((t) => hay.includes(t));
        })
        .slice(0, size);

      return NextResponse.json({ total: items.length, articles: items, provider: "pti" });
    }

    // Default: NewsData.io
    if (!NEWSDATA_API_KEY) return NextResponse.json({ error: "NEWSDATA_API_KEY not configured" }, { status: 503 });
    const category = searchParams.get("category") || "";
    const sizeStr = Math.min(size, 10).toString();
    let url = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_API_KEY}&q=${encodeURIComponent(query)}&language=${language}&size=${sizeStr}`;
    if (category) url += `&category=${category}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "success") {
      return NextResponse.json({ error: "NewsData API error", details: data }, { status: 502 });
    }
    const articles = (data.results || []).map((r: any) => ({
      externalId: r.article_id,
      title: r.title,
      description: r.description,
      content: r.content,
      imageUrl: r.image_url,
      sourceUrl: r.link,
      source: r.source_id,
      language: r.language,
      category: r.category?.[0] || "general",
      publishedAt: r.pubDate,
      keywords: r.keywords || [],
    }));
    return NextResponse.json({ total: data.totalResults, articles, nextPage: data.nextPage, provider: "newsdata" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/fetch-news - import a news article as draft
export async function POST(req: NextRequest) {
  const session2 = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session2)) return session2;
  try {
    const body = await req.json();
    const { title, description, imageUrl, sourceUrl, categorySlug } = body;

    if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

    // Find category or use default
    let categoryId = "";
    if (categorySlug) {
      const cat = await prisma.category.findUnique({ where: { slug: categorySlug } });
      categoryId = cat?.id || "";
    }
    if (!categoryId) {
      const defaultCat = await prisma.category.findFirst({ orderBy: { sortOrder: "asc" } });
      categoryId = defaultCat?.id || "";
    }

    // Dedup - skip if this source URL is already in Content (Spec #1 #109).
    if (sourceUrl) {
      const dupe = await prisma.content.findUnique({ where: { sourceUrl }, select: { id: true, slug: true } });
      if (dupe) return NextResponse.json({ error: "Already imported", existing: dupe }, { status: 409 });
    }

    // Find admin user as author
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });

    // Re-host source image on Azure Blob (publishers block hotlinking)
    const hostedImage = await uploadImageFromUrl(imageUrl);

    // Create slug from title - sanitized + timestamp for uniqueness
    const slug = sanitizeSlug(`${buildSlugFromTitle(title)}-${Date.now()}`);

    const content = await prisma.content.create({
      data: {
        type: "ARTICLE",
        title,
        slug,
        summary: description?.substring(0, 200) || null,
        body: `<p>${description || ""}</p>\n<p><em>Source: <a href="${sourceUrl}">${sourceUrl}</a></em></p>`,
        featuredImage: hostedImage,
        sourceUrl: sourceUrl || null,
        language: "TELUGU",
        status: "DRAFT",
        authorId: admin?.id || "",
        categoryId,
      },
    });

    return NextResponse.json(content, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
