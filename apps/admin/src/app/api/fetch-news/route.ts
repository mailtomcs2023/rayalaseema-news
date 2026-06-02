import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError } from "@/lib/api-utils";
import { buildSlugFromTitle, sanitizeSlug } from "@/lib/slug";
import { uploadImageFromUrl } from "@/lib/blob";

const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;

// GET /api/fetch-news?provider=newsdata|googlenews&q=...
//
// Two free providers shipped:
//   newsdata   - NewsData.io REST API. Requires NEWSDATA_API_KEY.
//   googlenews - Google News RSS endpoint. No key required, no rate limit
//                docs but treated as zero-trust public surface.
//
// Both return the same shape: { articles: [{ externalId, title, description,
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
