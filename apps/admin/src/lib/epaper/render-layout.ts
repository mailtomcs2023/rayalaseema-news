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
import { hyphenateTelugu } from "./telugu-hyphenation";

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
    | "continuation"   // remainder of an overflow story, lives on a later page
    | "image"
    | "ad"
    | "text"
    | "story-jump"
    | "pull-quote";   // #103 — emphasized excerpt block
  x: number;
  y: number;
  w: number;
  h: number;
  articleId?: string;
  adAssetId?: string;     // ad block reference into EpaperAdAsset library
  overrideTitle?: string; // per-placement headline override; falls back to article.title
  overrideDek?: string;   // per-placement summary override; falls back to article.summary
  imageCrop?: { x: number; y: number; w: number; h: number }; // 0..1 fractional crop on featured image
  content?: string;
  href?: string;
  targetPage?: number;
  locked?: boolean;
  /** Per-block style overrides — picked from the editor's 🎨 Style panel.
   *  imagePosition: top (default), left, right, none.
   *  imageSize: percent of block width when position=left/right (10..70, default 40).
   *  textColumns: 1 | 2 | 3 (default 2 on lead, 1 elsewhere).
   *  hlScale: 0.75..2 — multiplier on default headline font-size.
   *  hlColor: hex headline text color.
   *  hlBgColor: hex headline panel background (Eenadu-style red banner).
   *  blockBgColor: hex whole-block bg (left-rail bullet panels, etc).
   *  textColor: hex body-text color override.
   *  padding: px inside-block padding (default 6).
   *  margin: px outside-block extra margin (default 0). */
  style?: {
    imagePosition?: "top" | "left" | "right" | "none" | "wrap";
    imageSize?: number;       // percent 10..70
    textColumns?: 1 | 2 | 3;
    hlScale?: number;
    hlColor?: string;
    hlBgColor?: string;
    blockBgColor?: string;
    textColor?: string;
    padding?: number;
    margin?: number;
    dropCap?: boolean;           // #103 — drop cap on lead body first letter
    pullQuoteAttribution?: string; // #103 — small "— By X" line under pull-quote
  };
  // Continuation metadata (matches continuation.ts)
  continuesToPage?: number;
  continuesToBlockId?: string;
  continuesFromPage?: number;
  continuesFromBlockId?: string;
  bodyStart?: number;
}

interface ResolvedArticle {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  featuredImage: string | null;
  bodyText: string;    // plain-text body for continuation rendering
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

// Body-text variant of esc that also injects soft hyphens into long Telugu
// tokens (#102). Use for paragraph/body content; skip for headlines where
// soft hyphens would change visual measure of the headline-set.
function bodyEsc(s: string | null | undefined): string {
  return esc(hyphenateTelugu(s || ""));
}

function articleHref(slug: string): string {
  return `${SITE_URL}/article/${slug}`;
}

function articleLink(a: ResolvedArticle, inner: string): string {
  // The href becomes a real PDF link annotation under Playwright `page.pdf`.
  return `<a class="story-link" href="${esc(articleHref(a.slug))}">${inner}</a>`;
}

function blockStyle(b: Block, extra = ""): string {
  // Merge user style overrides for the block's outer wrapper.
  const s = b.style ?? {};
  const parts: string[] = [
    `grid-column: ${b.x + 1} / span ${b.w}`,
    `grid-row: ${b.y + 1} / span ${b.h}`,
  ];
  if (s.blockBgColor) parts.push(`background-color: ${s.blockBgColor}`);
  if (s.textColor) parts.push(`color: ${s.textColor}`);
  if (typeof s.padding === "number") parts.push(`padding: ${s.padding}px`);
  if (typeof s.margin === "number") parts.push(`margin: ${s.margin}px`);
  if (extra) parts.push(extra);
  return parts.join("; ");
}

function hlInlineStyle(s: Block["style"] | undefined, basePx: number): string {
  const out: string[] = [];
  if (s?.hlScale && s.hlScale !== 1) out.push(`font-size:${(basePx * s.hlScale).toFixed(0)}px`);
  if (s?.hlColor) out.push(`color:${s.hlColor}`);
  if (s?.hlBgColor) out.push(`background:${s.hlBgColor}`);
  if (s?.hlBgColor) out.push(`padding:6px 12px`);
  return out.length ? ` style="${out.join(";")}"` : "";
}

function imageOrFallback(url: string | null | undefined, className: string, crop?: { x: number; y: number; w: number; h: number }): string {
  if (url) {
    // When an imageCrop is set, scale the image so the crop rect fills the
    // container, then offset so the crop window starts at (0,0). Simple
    // transform — works in PDF render because Playwright honors CSS transforms.
    let imgStyle = "";
    if (crop && crop.w > 0 && crop.h > 0) {
      const scaleX = 1 / crop.w;
      const scaleY = 1 / crop.h;
      const offsetX = -crop.x * 100 * scaleX;
      const offsetY = -crop.y * 100 * scaleY;
      imgStyle = ` style="transform: translate(${offsetX}%, ${offsetY}%) scale(${scaleX}, ${scaleY}); transform-origin: 0 0;"`;
    }
    return `<div class="ph ${className}"><img src="${esc(url)}" alt="" loading="eager" crossorigin="anonymous" referrerpolicy="no-referrer"${imgStyle} /></div>`;
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
  const displayTitle = b.overrideTitle?.trim() || a.title;
  const displaySummary = b.overrideDek?.trim() || a.summary || "";

  const imgPos = b.style?.imagePosition ?? "top";
  const imgSize = b.style?.imageSize ?? 40;
  const cols = b.style?.textColumns ?? 2;
  const dropCap = b.style?.dropCap === true;
  const isWrap = imgPos === "wrap";
  const img = imgPos === "none" || isWrap ? "" : imageOrFallback(a.featuredImage, "lead-img", b.imageCrop);
  // Wrap-mode renders the image inline inside the multi-column body so text
  // flows around it (CSS shape-outside). The wrap markup is emitted by
  // dekHtml below instead of as a sibling.
  const wrapImageMarkup = isWrap && a.featuredImage
    ? `<span class="wrap-img">${imageOrFallback(a.featuredImage, "lead-img", b.imageCrop)}</span>`
    : "";
  const useFlex = imgPos === "left" || imgPos === "right";
  const wrapClass = imgPos === "left" ? "lead-flex-row"
                  : imgPos === "right" ? "lead-flex-row-rev"
                  : ""; // default top + wrap = no extra wrapper class
  const imgWrapStyle = useFlex ? ` style="flex:0 0 ${imgSize}%"` : "";
  const hlStyle = hlInlineStyle(b.style, 42);
  const dekClass = `lead-dek${dropCap ? " drop-cap" : ""}${isWrap ? " has-wrap-image" : ""}`;
  const dekStyle = ` style="column-count:${cols}${b.style?.textColor ? `;color:${b.style.textColor}` : ""}"`;
  // If a continuation block exists on a later page, render the dek as plain
  // body-text truncated at `bodyStart` (set by the continuation post-process)
  // and append a goto-page jump link. Otherwise fall back to the summary.
  const dekHtml = (() => {
    if (b.continuesToPage && b.continuesToBlockId) {
      const target = b.continuesToPage;
      // bodyStart is char offset of where the split happens — known only on
      // the continuation block, but the renderer can re-derive a sensible cut
      // by trimming summary || bodyText to the same approximate length.
      const text = a.bodyText || a.summary || "";
      const splitAt = findApproxSplit(text, 1400);
      const head = text.slice(0, splitAt).trim();
      return `<p class="${dekClass}"${dekStyle}>${wrapImageMarkup}${bodyEsc(head)}<a class="jump-link" href="#page=${target}"> &nbsp;→ మిగతా కథనం పేజీ ${target}</a></p>`;
    }
    return displaySummary ? `<p class="${dekClass}"${dekStyle}>${wrapImageMarkup}${bodyEsc(displaySummary)}</p>` : "";
  })();
  // For default top-position render the image as a direct child of block-inner
  // so the `.lead-img { flex:0 0 300px }` rule keeps its height contract.
  // For left/right (flex-row), the wrapper holds the imgSize% basis.
  const imgHtml = img
    ? (useFlex
        ? `<div class="lead-image-wrap"${imgWrapStyle}>${img}</div>`
        : img)
    : "";
  const inner = `
    <div class="block-inner ${wrapClass}">
      <div class="lead-text">
        <div class="kicker">${esc(a.categoryName)}</div>
        <h1 class="lead-hl"${hlStyle}>${esc(displayTitle)}</h1>
        ${desk}
        ${dekHtml}
      </div>
      ${imgHtml}
    </div>`;
  return `<article class="lead block" style="${blockStyle(b)}">${articleLink(a, inner)}</article>`;
}

function majorBlock(b: Block, a: ResolvedArticle): string {
  const displayTitle = b.overrideTitle?.trim() || a.title;
  const displaySummary = b.overrideDek?.trim() || a.summary || "";
  const dekHtml = (() => {
    if (b.continuesToPage) {
      const text = a.bodyText || a.summary || "";
      const splitAt = findApproxSplit(text, 280);
      const head = text.slice(0, splitAt).trim();
      return `<p class="maj-dek">${bodyEsc(head)}<a class="jump-link" href="#page=${b.continuesToPage}"> →పేజీ ${b.continuesToPage}</a></p>`;
    }
    return displaySummary ? `<p class="maj-dek">${bodyEsc(displaySummary)}</p>` : "";
  })();
  const hlStyle = hlInlineStyle(b.style, 22);
  const inner = `
    <div class="block-inner">
      ${imageOrFallback(a.featuredImage, "maj-img", b.imageCrop)}
      <div class="kicker sm">${esc(a.categoryName)}</div>
      <h2 class="maj-hl"${hlStyle}>${esc(displayTitle)}</h2>
      ${dekHtml}
    </div>`;
  return `<article class="major block" style="${blockStyle(b)}">${articleLink(a, inner)}</article>`;
}

/** Splits `text` near `target` chars at the nearest sentence/word boundary. */
function findApproxSplit(text: string, target: number): number {
  if (text.length <= target) return text.length;
  const candidates = [". ", "। ", "? ", "! ", "; "];
  let best = target;
  for (const c of candidates) {
    const i = text.indexOf(c, Math.max(0, target - 200));
    if (i > 0 && i <= target + 100 && Math.abs(i - target) < Math.abs(best - target)) {
      best = i + c.length;
    }
  }
  if (best === target) {
    const sp = text.lastIndexOf(" ", target);
    if (sp > target - 200) best = sp + 1;
  }
  return Math.min(best, text.length);
}

function continuationBlock(b: Block, a: ResolvedArticle): string {
  const from = b.continuesFromPage ?? 0;
  const start = typeof b.bodyStart === "number" ? b.bodyStart : 0;
  const tail = a.bodyText.slice(start).trim();
  // Cap at a generous slice — anything longer gets clipped by CSS overflow.
  const slice = tail.slice(0, 3000);
  const inner = `
    <div class="block-inner">
      <div class="cont-header">
        <span class="cont-from">← ${from}వ పేజీ తరువాత</span>
        <span class="cont-hl">${esc(a.title)}</span>
      </div>
      <p class="cont-body">${esc(slice)}</p>
    </div>`;
  return `<article class="continuation block" style="${blockStyle(b)}">${articleLink(a, inner)}</article>`;
}

function secondaryBlock(b: Block, a: ResolvedArticle): string {
  const displayTitle = b.overrideTitle?.trim() || a.title;
  const hlStyle = hlInlineStyle(b.style, 17);
  const inner = `
    <div class="block-inner">
      ${imageOrFallback(a.featuredImage, "sec-img", b.imageCrop)}
      <h3 class="sec-hl"${hlStyle}>${esc(displayTitle)}</h3>
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

function imageBlock(b: Block, imageAssetUrlsById?: Record<string, { imageUrl: string; caption?: string | null }>): string {
  // Prefer a resolved library asset (b.adAssetId reused for image-library
  // references for now to avoid a schema migration on layout JSON), then
  // fall back to b.content as a raw URL.
  const fromLib = b.adAssetId && imageAssetUrlsById?.[b.adAssetId];
  const url = fromLib?.imageUrl ?? b.content;
  const caption = fromLib?.caption;
  return `<div class="block image" style="${blockStyle(b)}">
    ${imageOrFallback(url, "free-img", b.imageCrop)}
    ${caption ? `<div class="image-caption">${esc(caption)}</div>` : ""}
  </div>`;
}

function adBlock(b: Block, ads: RenderInput["ads"]): string {
  // Two paths:
  //   1. v2: block.adAssetId points at a library row → resolved server-side
  //      and passed in `ads[b.id]` by the caller
  //   2. legacy: editor-level EpaperAd records keyed by slot, still passed
  //      via `ads[b.id]`. The caller maps both into the same shape.
  const ad = ads?.[b.id];
  if (!ad) return `<div class="adzone block empty" style="${blockStyle(b)}"></div>`;
  const link = ad.href ? `<a href="${esc(ad.href)}">${imageOrFallback(ad.imageUrl, "ad-img")}</a>` : imageOrFallback(ad.imageUrl, "ad-img");
  return `<div class="adzone block" style="${blockStyle(b)}">${link}</div>`;
}

function textBlock(b: Block): string {
  return `<div class="block text" style="${blockStyle(b)}">${b.content ?? ""}</div>`;
}

function pullQuoteBlock(b: Block): string {
  const text = b.content ?? "";
  const attribution = b.style?.pullQuoteAttribution
    ? `<span class="pq-attr">— ${esc(b.style.pullQuoteAttribution)}</span>`
    : "";
  return `<div class="block pull-quote" style="${blockStyle(b)}">${esc(text)}${attribution}</div>`;
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

function stripHtml(s: string): string {
  return s
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
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
      body: true,
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
      bodyText: stripHtml(r.body || ""),
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

  // Resolve any image-library references attached to image blocks. The block
  // schema reuses `adAssetId` as a generic asset pointer for now — if it
  // matches an EpaperImageAsset id we wire it through to the renderer.
  const imageAssetIds = Array.from(new Set(
    input.layout.blocks.filter((b) => b.type === "image" && b.adAssetId).map((b) => b.adAssetId!)
  ));
  let imageAssetsById: Record<string, { imageUrl: string; caption?: string | null }> = {};
  if (imageAssetIds.length > 0) {
    const rows = await prisma.epaperImageAsset.findMany({
      where: { id: { in: imageAssetIds } },
      select: { id: true, imageUrl: true, caption: true },
    });
    imageAssetsById = Object.fromEntries(rows.map((r) => [r.id, { imageUrl: r.imageUrl, caption: r.caption }]));
  }

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
      case "continuation":
        if (b.articleId && articles.has(b.articleId)) {
          blockHtml.push(continuationBlock(b, articles.get(b.articleId)!));
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
        blockHtml.push(imageBlock(b, imageAssetsById));
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
      case "pull-quote":
        blockHtml.push(pullQuoteBlock(b));
        break;
    }
  }

  const maxRow = input.layout.blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0);

  return `<!DOCTYPE html>
<html lang="te"><head><meta charset="UTF-8">
<link href="${FONTS_HREF}" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1480px}
  body{
    font-family:'Noto Serif Telugu',serif;
    background:#FCFAF3;color:#14110b;
    padding:32px 36px;
    /* Baseline grid: 6 mm (~23 px @ 125 dpi) — all body line-heights snap to
       a multiple of this so text aligns horizontally across columns. */
    --baseline: 23px;
    /* Widow/orphan defaults — Telugu broadsheet convention: never leave a
       single line at the top of a column or the bottom of a paragraph. */
    orphans: 2;
    widows: 2;
    hyphens: auto;
  }
  /* Body-text classes snap to a 2× baseline (46 px ≈ 1.6 leading on 15 px
     body). Header classes use a 3× baseline so they still align. */
  .lead-dek, .maj-dek, .sec-hl, .cont-body, .brief-item { line-height: calc(var(--baseline) * 1); }
  .lead-hl { line-height: calc(var(--baseline) * 2); }
  .maj-hl, .cont-hl { line-height: calc(var(--baseline) * 1.2); }
  /* Avoid orphan/widow breaks inside story bodies. */
  .lead-dek, .maj-dek, .cont-body, .sec-hl, .brief-item { orphans: 2; widows: 2; }
  /* Headlines should never break across columns or pages. */
  .lead-hl, .maj-hl, .sec-hl, .cont-hl, .kicker, .byline { break-inside: avoid; page-break-inside: avoid; }

  /* Drop cap (#103) — opt-in via b.style.dropCap on lead blocks. Renders
     the first character ~3 lines tall, floated. */
  .lead-dek.drop-cap::first-letter {
    initial-letter: 3;
    -webkit-initial-letter: 3;
    float: left;
    font-family: 'Ramabhadra', 'Noto Serif Telugu', serif;
    font-weight: 900;
    color: #A50D0D;
    font-size: 4.2em;
    line-height: 0.85;
    padding: 4px 8px 0 0;
    margin-top: 4px;
  }

  /* Pull quote (#103) — emphasized excerpt rendered as its own block type. */
  .pull-quote { border-top: 3px double #A50D0D; border-bottom: 3px double #A50D0D;
    padding: 14px 18px; margin: 8px 0; font-family: 'Ramabhadra', serif;
    font-size: 22px; line-height: 1.4; color: #5b1f1f; font-style: italic;
    text-align: center; }
  .pull-quote::before, .pull-quote::after { color: #A50D0D; font-size: 28px; line-height: 0; vertical-align: -8px; }
  .pull-quote::before { content: "“ "; }
  .pull-quote::after  { content: " ”"; }
  .pull-quote .pq-attr { display: block; margin-top: 6px; font-size: 13px;
    font-family: 'Noto Sans Telugu', sans-serif; font-style: normal;
    color: #6b6155; letter-spacing: 1px; text-transform: uppercase; }

  /* Multi-column wrap-around: when lead has image-position=wrap, image
     floats to right inside the multi-column body so text flows around it. */
  .lead-dek.has-wrap-image .wrap-img {
    float: right; width: 40%; margin: 4px 0 8px 14px;
    shape-outside: inset(0 round 4px); shape-margin: 6px;
  }
  .lead-dek.has-wrap-image .wrap-img img { width: 100%; height: auto; display: block; border-radius: 4px; }
  /* 12-col broadsheet grid. Row height is roomy so 28-row templates fill the
     full 2760-px viewport — leaves space for 12-18 stories per page. */
  .page {
    display:grid;
    grid-template-columns: repeat(12, 1fr);
    grid-template-rows: repeat(${maxRow}, 92px);
    column-gap: 14px;
    row-gap: 12px;
  }
  .block { overflow: hidden; }
  .block .block-inner { width:100%; height:100%; display:flex; flex-direction:column; }
  .block a.story-link { color: inherit; text-decoration: none; display:block; height:100%; }

  /* Masthead */
  .masthead{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #14110b;padding:0 10px;height:100%}
  .mast-mid{text-align:center;flex:1}
  .mast-logo{font-family:'Ramabhadra',serif;font-size:64px;color:#A50D0D;line-height:1}
  .mast-tag{font-family:'Noto Sans Telugu',sans-serif;font-size:13px;letter-spacing:6px;color:#6b6155;margin-top:5px}
  .mast-side{font-family:'Noto Sans Telugu',sans-serif;font-size:12px;line-height:1.5;color:#6b6155;width:170px}
  .mast-side.r{text-align:right}

  /* Section band */
  .secbar{
    display:flex;justify-content:space-between;align-items:center;
    background:#A50D0D;color:#fff;padding:8px 18px;height:100%;
  }
  .secbar-name{font-family:'Ramabhadra',serif;font-size:38px}
  .secbar-meta{font-family:'Noto Sans Telugu',sans-serif;font-size:13px}

  .kicker{font-family:'Noto Sans Telugu',sans-serif;font-size:14px;font-weight:800;color:#A50D0D;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
  .kicker.sm{font-size:11px;margin:5px 0 3px}
  .byline{font-family:'Noto Sans Telugu',sans-serif;font-size:13px;font-weight:700;color:#A50D0D;font-style:italic;margin:0 0 8px}

  /* Lead — block-inner layout variants for image-position style */
  .lead-stack { display: flex; flex-direction: column; }
  .lead-flex-row { display: flex; flex-direction: row; gap: 12px; }
  .lead-flex-row-rev { display: flex; flex-direction: row-reverse; gap: 12px; }
  .lead-flex-row > .lead-image-wrap,
  .lead-flex-row-rev > .lead-image-wrap { flex: 0 0 40%; }
  .lead-flex-row > .lead-text,
  .lead-flex-row-rev > .lead-text { flex: 1 1 auto; min-width: 0; }
  .lead-text { display: flex; flex-direction: column; min-width: 0; }
  .lead { padding: 6px 0; border-right: 1px solid #c9c1ad; padding-right: 12px; }
  .lead-hl{font-family:'Noto Serif Telugu',serif;font-weight:900;font-size:42px;line-height:1.18;margin-bottom:10px}
  .lead-img{flex:0 0 300px;margin-bottom:10px}
  .lead-dek{
    font-size:15px;line-height:1.6;color:#34302a;text-align:justify;
    column-count:2;column-gap:18px;column-rule:1px solid #d8d0bd;
    flex: 1 1 auto; overflow: hidden;
  }

  /* Major */
  .major { padding: 6px 0; border-bottom: 1px dotted #c9c1ad; }
  .maj-img{flex:0 0 160px;margin-bottom:8px}
  .maj-hl{font-family:'Noto Serif Telugu',serif;font-weight:800;font-size:22px;line-height:1.25;margin-bottom:5px}
  .maj-dek{font-size:13px;line-height:1.5;color:#4a443c;text-align:justify;flex:1 1 auto;overflow:hidden}

  /* Secondary */
  .secondary { padding: 6px 0; border-right: 1px solid #c9c1ad; padding-right: 10px;}
  .sec-img{flex:0 0 130px;margin-bottom:6px}
  .sec-hl{font-family:'Noto Serif Telugu',serif;font-weight:800;font-size:17px;line-height:1.3;flex:1 1 auto;overflow:hidden}

  /* Images */
  .ph{width:100%;overflow:hidden;background:#e9e3d4;border:1px solid #d3cab5;height:100%}
  .ph img{width:100%;height:100%;object-fit:cover;display:block}
  .ph.noimg{display:flex;align-items:center;justify-content:center;
    font-family:'Ramabhadra',serif;color:#bdb39c;font-size:18px}

  /* Continuation (article tail on later page) */
  .continuation { padding: 6px 0; border-top: 2px solid #14110b; }
  .cont-header { display: flex; flex-direction: column; gap: 2px; margin-bottom: 6px; }
  .cont-from { font-family: 'Noto Sans Telugu', sans-serif; font-size: 11px; font-weight: 700; color: #A50D0D; text-transform: uppercase; letter-spacing: 1px; }
  .cont-hl { font-family: 'Noto Serif Telugu', serif; font-weight: 800; font-size: 18px; line-height: 1.25; color: #14110b; }
  .cont-body { font-size: 13px; line-height: 1.6; color: #34302a; text-align: justify;
    column-count: 2; column-gap: 14px; column-rule: 1px solid #d8d0bd; flex: 1 1 auto; overflow: hidden; }

  /* Inline jump link inside lead / major dek */
  .jump-link { color: #A50D0D; font-weight: 800; text-decoration: none; font-family: 'Noto Sans Telugu', sans-serif; font-size: 0.95em; white-space: nowrap; }

  /* Briefs */
  .briefs{ display:flex; flex-direction:column; padding-top:8px; }
  .briefs-head{font-family:'Ramabhadra',serif;font-size:22px;color:#A50D0D;margin-bottom:8px;
    border-bottom:2px solid #14110b;padding-bottom:4px}
  .briefs-cols{column-count:1;column-gap:20px;column-rule:1px solid #d8d0bd;flex:1 1 auto;overflow:hidden}
  .brief-item{display:flex;gap:8px;padding:5px 0;border-bottom:1px dotted #cdc6b5;break-inside:avoid;
    font-size:14px;font-weight:600;line-height:1.4}
  .brief-item a{color:inherit;text-decoration:none}
  .dot{width:6px;height:6px;border-radius:50%;background:#A50D0D;flex-shrink:0;margin-top:7px}

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

  // 1. Legacy per-edition ads (EpaperAd) keyed by slot.
  const legacyAds = await prisma.epaperAd.findMany({
    where: { editionId: page.editionId, pageNumber: page.pageNumber },
  });
  const adsByBlockId: Record<string, { imageUrl: string; href?: string | null }> = {};
  for (const a of legacyAds) {
    const key = a.slot.startsWith("ad-") ? a.slot : `ad-${a.slot === "top" ? "top" : "bot"}`;
    adsByBlockId[key] = { imageUrl: a.imageUrl, href: a.linkUrl };
  }

  // 2. v2 ads: layout block's adAssetId → EpaperAdAsset library.
  const layout = (page.layout as unknown as { blocks: Block[] }) ?? { blocks: [] };
  const adAssetIds = Array.from(new Set(
    layout.blocks.filter((b) => b.type === "ad" && b.adAssetId).map((b) => b.adAssetId!)
  ));
  if (adAssetIds.length > 0) {
    const assets = await prisma.epaperAdAsset.findMany({
      where: { id: { in: adAssetIds } },
      select: { id: true, imageUrl: true, linkUrl: true },
    });
    const assetById = new Map(assets.map((a) => [a.id, a]));
    for (const b of layout.blocks) {
      if (b.type === "ad" && b.adAssetId && assetById.has(b.adAssetId)) {
        const a = assetById.get(b.adAssetId)!;
        adsByBlockId[b.id] = { imageUrl: a.imageUrl, href: a.linkUrl };
      }
    }
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
