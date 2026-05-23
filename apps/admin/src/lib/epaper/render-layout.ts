// Vector PDF renderer for e-paper v2.
//
// Input: an EpaperPage row (layout JSON + label + templateSlug).
// Output: an HTML document string that Playwright can convert to a *vector*
// PDF via `page.pdf()`. Real selectable text + working `<a href>` links —
// replaces the screenshot-then-embed-PNG path used by v1.
//
// The grid is 12 columns × N rows. Block coordinates are integer grid cells.
// A standard tabloid sheet is rendered at 1200×2000 px (matches v1 sizing so
// existing ad creatives still fit), with each cell = 100 × 72 px.

import { prisma } from "@rayalaseema/db";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemaexpress.com";

interface Block {
  id: string;
  type:
    | "masthead"
    | "section-band"
    | "lead"
    | "major"
    | "secondary"
    | "brief"
    | "image"
    | "ad"
    | "text"
    | "story-jump";
  x: number;
  y: number;
  w: number;
  h: number;
  articleId?: string;
  content?: string;
  href?: string;
  targetPage?: number;
  locked?: boolean;
  style?: Record<string, string>;
}

interface ResolvedArticle {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  featuredImage: string | null;
  categoryName: string;
  deskName: string | null;
}

interface RenderInput {
  pageNumber: number;
  totalPages: number;
  label: string;
  templateSlug: string | null;
  dateLabel: string;
  layout: { blocks: Block[] };
  // ad image map keyed by block id
  ads?: Record<string, { imageUrl: string; href?: string | null }>;
}

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Ramabhadra&family=Noto+Serif+Telugu:wght@400;500;600;700;800;900&family=Noto+Sans+Telugu:wght@400;500;600;700;800;900&display=swap";

function esc(s: string | null | undefined): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function articleHref(slug: string): string {
  return `${SITE_URL}/article/${slug}`;
}

function articleLink(a: ResolvedArticle, inner: string): string {
  // The href becomes a real PDF link annotation under Playwright `page.pdf`.
  return `<a class="story-link" href="${esc(articleHref(a.slug))}">${inner}</a>`;
}

function blockStyle(b: Block, extra = ""): string {
  return `grid-column: ${b.x + 1} / span ${b.w}; grid-row: ${b.y + 1} / span ${b.h}; ${extra}`;
}

function imageOrFallback(url: string | null | undefined, className: string): string {
  if (url) {
    return `<div class="ph ${className}"><img src="${esc(url)}" alt="" /></div>`;
  }
  return `<div class="ph ${className} noimg">రాయలసీమ ఎక్స్‌ప్రెస్</div>`;
}

function masthead(b: Block, opts: { dateLabel: string }): string {
  return `<div class="masthead" style="${blockStyle(b)}">
    <div class="mast-side">ఈ-ఎడిషన్<br/>${esc(opts.dateLabel)}</div>
    <div class="mast-mid">
      <div class="mast-logo">రాయలసీమ ఎక్స్‌ప్రెస్</div>
      <div class="mast-tag">— THE VOICE OF RAYALASEEMA —</div>
    </div>
    <div class="mast-side r">కర్నూలు · నంద్యాల · అనంతపురం<br/>కడప · తిరుపతి · చిత్తూరు</div>
  </div>`;
}

function sectionBand(b: Block, label: string, opts: { dateLabel: string; pageNumber: number }): string {
  return `<div class="secbar" style="${blockStyle(b)}">
    <span class="secbar-name">${esc(label)}</span>
    <span class="secbar-meta">రాయలసీమ ఎక్స్‌ప్రెస్ · ${esc(opts.dateLabel)} · పేజీ ${opts.pageNumber}</span>
  </div>`;
}

function leadBlock(b: Block, a: ResolvedArticle): string {
  const desk = a.deskName ? `<div class="byline">— ${esc(a.deskName.replace(/ - /g, ", "))}</div>` : "";
  const inner = `
    <div class="block-inner">
      <div class="kicker">${esc(a.categoryName)}</div>
      <h1 class="lead-hl">${esc(a.title)}</h1>
      ${desk}
      ${imageOrFallback(a.featuredImage, "lead-img")}
      ${a.summary ? `<p class="lead-dek">${esc(a.summary)}</p>` : ""}
    </div>`;
  return `<article class="lead block" style="${blockStyle(b)}">${articleLink(a, inner)}</article>`;
}

function majorBlock(b: Block, a: ResolvedArticle): string {
  const inner = `
    <div class="block-inner">
      ${imageOrFallback(a.featuredImage, "maj-img")}
      <div class="kicker sm">${esc(a.categoryName)}</div>
      <h2 class="maj-hl">${esc(a.title)}</h2>
      ${a.summary ? `<p class="maj-dek">${esc(a.summary)}</p>` : ""}
    </div>`;
  return `<article class="major block" style="${blockStyle(b)}">${articleLink(a, inner)}</article>`;
}

function secondaryBlock(b: Block, a: ResolvedArticle): string {
  const inner = `
    <div class="block-inner">
      ${imageOrFallback(a.featuredImage, "sec-img")}
      <h3 class="sec-hl">${esc(a.title)}</h3>
    </div>`;
  return `<article class="secondary block" style="${blockStyle(b)}">${articleLink(a, inner)}</article>`;
}

function briefBlock(b: Block, articles: ResolvedArticle[]): string {
  const items = articles
    .map((a) => `<div class="brief-item">${articleLink(a, `<span class="dot"></span><span>${esc(a.title)}</span>`)}</div>`)
    .join("");
  return `<div class="briefs block" style="${blockStyle(b)}">
    <div class="briefs-head">క్లుప్త వార్తలు</div>
    <div class="briefs-cols">${items}</div>
  </div>`;
}

function imageBlock(b: Block): string {
  return `<div class="block image" style="${blockStyle(b)}">
    ${imageOrFallback(b.content, "free-img")}
  </div>`;
}

function adBlock(b: Block, ads: RenderInput["ads"]): string {
  const ad = ads?.[b.id];
  if (!ad) return `<div class="adzone block empty" style="${blockStyle(b)}"></div>`;
  const link = ad.href ? `<a href="${esc(ad.href)}">${imageOrFallback(ad.imageUrl, "ad-img")}</a>` : imageOrFallback(ad.imageUrl, "ad-img");
  return `<div class="adzone block" style="${blockStyle(b)}">${link}</div>`;
}

function textBlock(b: Block): string {
  return `<div class="block text" style="${blockStyle(b)}">${b.content ?? ""}</div>`;
}

function storyJumpBlock(b: Block): string {
  // pdf-lib post-processing adds a goto-page annotation on the link href
  // `#page=N` is honored by most PDF viewers as an internal jump.
  const target = b.targetPage ?? 1;
  const text = b.content ?? `మిగతా కథనం → పేజీ ${target}`;
  return `<div class="block jump" style="${blockStyle(b)}">
    <a href="#page=${target}" data-target-page="${target}">${esc(text)} ›</a>
  </div>`;
}

async function resolveArticles(blocks: Block[]): Promise<Map<string, ResolvedArticle>> {
  const ids = Array.from(new Set(blocks.map((b) => b.articleId).filter((x): x is string => !!x)));
  if (ids.length === 0) return new Map();
  const rows = await prisma.article.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      featuredImage: true,
      category: { select: { name: true } },
      desk: { select: { name: true } },
    },
  });
  const map = new Map<string, ResolvedArticle>();
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      featuredImage: r.featuredImage,
      categoryName: r.category.name,
      deskName: r.desk?.name ?? null,
    });
  }
  return map;
}

/**
 * Render a single page to an HTML document suitable for Playwright `page.pdf()`.
 * Returns full <!DOCTYPE html>… string. Caller is responsible for invoking
 * Playwright and writing the resulting PDF buffer.
 */
export async function renderLayoutToHtml(input: RenderInput): Promise<string> {
  const articles = await resolveArticles(input.layout.blocks);

  // Group consecutive brief blocks that share a region — each `brief` block
  // gets its OWN articleId assignment from autofill, but visually we want
  // multiple briefs to render as a list inside one block. The autofill engine
  // assigns one article per brief slot; the renderer treats each brief block
  // as a one-item list (still uses the multi-item HTML structure for
  // consistent styling).
  const blockHtml: string[] = [];

  for (const b of input.layout.blocks) {
    switch (b.type) {
      case "masthead":
        blockHtml.push(masthead(b, { dateLabel: input.dateLabel }));
        break;
      case "section-band":
        blockHtml.push(sectionBand(b, input.label, { dateLabel: input.dateLabel, pageNumber: input.pageNumber }));
        break;
      case "lead":
        if (b.articleId && articles.has(b.articleId)) {
          blockHtml.push(leadBlock(b, articles.get(b.articleId)!));
        }
        break;
      case "major":
        if (b.articleId && articles.has(b.articleId)) {
          blockHtml.push(majorBlock(b, articles.get(b.articleId)!));
        }
        break;
      case "secondary":
        if (b.articleId && articles.has(b.articleId)) {
          blockHtml.push(secondaryBlock(b, articles.get(b.articleId)!));
        }
        break;
      case "brief":
        if (b.articleId && articles.has(b.articleId)) {
          blockHtml.push(briefBlock(b, [articles.get(b.articleId)!]));
        } else {
          blockHtml.push(`<div class="briefs block empty" style="${blockStyle(b)}"></div>`);
        }
        break;
      case "image":
        blockHtml.push(imageBlock(b));
        break;
      case "ad":
        blockHtml.push(adBlock(b, input.ads));
        break;
      case "text":
        blockHtml.push(textBlock(b));
        break;
      case "story-jump":
        blockHtml.push(storyJumpBlock(b));
        break;
    }
  }

  const maxRow = input.layout.blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0);

  return `<!DOCTYPE html>
<html lang="te"><head><meta charset="UTF-8">
<link href="${FONTS_HREF}" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1200px}
  body{
    font-family:'Noto Serif Telugu',serif;
    background:#FCFAF3;color:#14110b;
    padding:26px 30px;
  }
  .page {
    display:grid;
    grid-template-columns: repeat(12, 1fr);
    grid-template-rows: repeat(${maxRow}, 60px);
    column-gap: 12px;
    row-gap: 10px;
  }
  .block { overflow: hidden; }
  .block .block-inner { width:100%; height:100%; display:flex; flex-direction:column; }
  .block a.story-link { color: inherit; text-decoration: none; display:block; height:100%; }

  /* Masthead */
  .masthead{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #14110b;padding:0 6px;height:100%}
  .mast-mid{text-align:center;flex:1}
  .mast-logo{font-family:'Ramabhadra',serif;font-size:48px;color:#A50D0D;line-height:1}
  .mast-tag{font-family:'Noto Sans Telugu',sans-serif;font-size:11px;letter-spacing:5px;color:#6b6155;margin-top:4px}
  .mast-side{font-family:'Noto Sans Telugu',sans-serif;font-size:10px;line-height:1.4;color:#6b6155;width:130px}
  .mast-side.r{text-align:right}

  /* Section band */
  .secbar{
    display:flex;justify-content:space-between;align-items:center;
    background:#A50D0D;color:#fff;padding:6px 14px;height:100%;
  }
  .secbar-name{font-family:'Ramabhadra',serif;font-size:28px}
  .secbar-meta{font-family:'Noto Sans Telugu',sans-serif;font-size:11px}

  .kicker{font-family:'Noto Sans Telugu',sans-serif;font-size:12px;font-weight:800;color:#A50D0D;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
  .kicker.sm{font-size:10px;margin:4px 0 2px}
  .byline{font-family:'Noto Sans Telugu',sans-serif;font-size:11px;font-weight:700;color:#A50D0D;font-style:italic;margin:0 0 6px}

  /* Lead */
  .lead { padding: 4px 0; border-right: 1px solid #c9c1ad; padding-right: 8px; }
  .lead-hl{font-family:'Noto Serif Telugu',serif;font-weight:900;font-size:30px;line-height:1.18;margin-bottom:8px}
  .lead-img{flex:0 0 220px;margin-bottom:8px}
  .lead-dek{
    font-size:13px;line-height:1.55;color:#34302a;text-align:justify;
    column-count:2;column-gap:14px;column-rule:1px solid #d8d0bd;
    flex: 1 1 auto; overflow: hidden;
  }

  /* Major */
  .major { padding: 4px 0; border-bottom: 1px dotted #c9c1ad; }
  .maj-img{flex:0 0 110px;margin-bottom:6px}
  .maj-hl{font-family:'Noto Serif Telugu',serif;font-weight:800;font-size:17px;line-height:1.25;margin-bottom:4px}
  .maj-dek{font-size:11px;line-height:1.45;color:#4a443c;text-align:justify;flex:1 1 auto;overflow:hidden}

  /* Secondary */
  .secondary { padding: 4px 0; border-right: 1px solid #c9c1ad; padding-right: 8px;}
  .sec-img{flex:0 0 90px;margin-bottom:5px}
  .sec-hl{font-family:'Noto Serif Telugu',serif;font-weight:800;font-size:14px;line-height:1.3;flex:1 1 auto;overflow:hidden}

  /* Images */
  .ph{width:100%;overflow:hidden;background:#e9e3d4;border:1px solid #d3cab5;height:100%}
  .ph img{width:100%;height:100%;object-fit:cover;display:block}
  .ph.noimg{display:flex;align-items:center;justify-content:center;
    font-family:'Ramabhadra',serif;color:#bdb39c;font-size:18px}

  /* Briefs */
  .briefs{ display:flex; flex-direction:column; padding-top:6px; }
  .briefs-head{font-family:'Ramabhadra',serif;font-size:18px;color:#A50D0D;margin-bottom:6px;
    border-bottom:2px solid #14110b;padding-bottom:3px}
  .briefs-cols{column-count:1;column-gap:18px;column-rule:1px solid #d8d0bd;flex:1 1 auto;overflow:hidden}
  .brief-item{display:flex;gap:7px;padding:4px 0;border-bottom:1px dotted #cdc6b5;break-inside:avoid;
    font-size:12px;font-weight:600;line-height:1.35}
  .brief-item a{color:inherit;text-decoration:none}
  .dot{width:5px;height:5px;border-radius:50%;background:#A50D0D;flex-shrink:0;margin-top:6px}

  /* Ads */
  .adzone{width:100%;overflow:hidden;border:1px solid #d3cab5;background:#f0ebdd;height:100%}
  .adzone img,.adzone .ad-img,.adzone .ph{width:100%;height:100%;object-fit:cover;display:block}
  .adzone.empty{background:repeating-linear-gradient(45deg,#fafafa,#fafafa 8px,#f0ebdd 8px,#f0ebdd 16px)}

  /* Jump */
  .jump{display:flex;align-items:center;justify-content:center;background:#fff3e0;border:1px dashed #A50D0D;border-radius:4px;height:100%}
  .jump a{color:#A50D0D;font-weight:700;font-size:12px;text-decoration:none;font-family:'Noto Sans Telugu',sans-serif}
</style></head>
<body>
  <div class="page">
    ${blockHtml.join("\n    ")}
  </div>
</body></html>`;
}

/** Convenience: load an EpaperPage by id and render its HTML. */
export async function renderEpaperPageById(pageId: string): Promise<string> {
  const page = await prisma.epaperPage.findUnique({
    where: { id: pageId },
    include: { edition: true },
  });
  if (!page) throw new Error(`EpaperPage ${pageId} not found`);

  const ads = await prisma.epaperAd.findMany({
    where: { editionId: page.editionId, pageNumber: page.pageNumber },
  });
  // Legacy ads keyed by slot ("top"/"bottom") — map them by block id heuristic
  // (block id contains "ad-top" / "ad-bot" / "ad-1" / etc.). New v2 ads should
  // be keyed directly by block id; we'll migrate the schema later.
  const adsByBlockId: Record<string, { imageUrl: string; href?: string | null }> = {};
  for (const a of ads) {
    const key = a.slot.startsWith("ad-") ? a.slot : `ad-${a.slot === "top" ? "top" : "bot"}`;
    adsByBlockId[key] = { imageUrl: a.imageUrl, href: a.linkUrl };
  }

  const pageCount = await prisma.epaperPage.count({ where: { editionId: page.editionId } });

  return renderLayoutToHtml({
    pageNumber: page.pageNumber,
    totalPages: pageCount,
    label: page.label,
    templateSlug: page.templateSlug,
    dateLabel: page.edition.date.toLocaleDateString("te-IN", { day: "numeric", month: "long", year: "numeric" }),
    layout: (page.layout as unknown as { blocks: Block[] }) ?? { blocks: [] },
    ads: adsByBlockId,
  });
}
