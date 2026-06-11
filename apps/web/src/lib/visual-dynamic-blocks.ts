// Server-side expansion of dynamic blocks in GrapesJS visual pages.
//
// A dynamic card block is a WRAPPER that carries a data SOURCE + filters, with
// the admin's designed card inside it. Each element in the card carries a
// data-rsn-bind="<field>" attribute. At render time we pull items from the
// source and clone the card per item, filling every bound element with that
// field's value:
//   <div data-rsn-block="latest-news" data-source="latest" data-category=""
//        data-count="6" data-columns="3" data-gap="20" data-featured="0">
//     <a class="rsn-ln-card" data-rsn-card>
//       <img data-rsn-bind="image"/>
//       <h3 data-rsn-bind="title"></h3>
//       <p  data-rsn-bind="summary"></p>
//       <span data-rsn-bind="date"></span>
//     </a>
//   </div>
// Keep the field list + sources in sync with the editor (grapes-dynamic-blocks)
// and the preview API.

import { prisma } from "@rayalaseema/db";
import { articleHref } from "@/lib/article-href";
import { categoryHref } from "@/lib/category-href";
import { parse, type HTMLElement as PNode } from "node-html-parser";

const DYNAMIC_CSS = `
.rsn-ln { display: grid; }
.rsn-ln-card { display: flex; flex-direction: column; text-decoration: none; color: inherit; background: #fff; border: 1px solid #ececec; border-radius: 10px; overflow: hidden; transition: box-shadow .2s ease, transform .2s ease; }
.rsn-ln-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.08); }
.rsn-ln-img { aspect-ratio: 16/9; background: #e9ebef; overflow: hidden; }
.rsn-ln-img img, img.rsn-ln-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rsn-ln-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.rsn-ln-title { font-family: var(--font-telugu-heading, inherit); font-size: 16px; font-weight: 700; line-height: 1.35; color: #111827; margin: 0; }
.rsn-ln-summary { font-size: 13px; line-height: 1.55; color: #6b7280; margin: 0; }
.rsn-ln-meta { font-size: 11px; font-weight: 600; color: #9ca3af; margin-top: auto; }
.rsn-ln-meta b { color: var(--brand, #E01B1B); }
.rsn-ln-empty { padding: 24px; color: #9ca3af; font-size: 13px; }
@media (max-width: 700px) { .rsn-ln { grid-template-columns: 1fr !important; } }
`;

const DEFAULT_TEMPLATE =
  `<a class="rsn-ln-card" data-rsn-card href="#"><div class="rsn-ln-img" data-rsn-bind="image"><img alt=""/></div><div class="rsn-ln-body"><h3 class="rsn-ln-title" data-rsn-bind="title"></h3><p class="rsn-ln-summary" data-rsn-bind="summary"></p><span class="rsn-ln-meta" data-rsn-bind="category"></span></div></a>`;

// source -> Content.type (+ whether to filter featured)
const SOURCE_TYPE: Record<string, string> = {
  latest: "ARTICLE",
  featured: "ARTICLE",
  breaking: "BREAKING_NEWS",
  video: "VIDEO",
  reel: "REEL",
  gallery: "PHOTO_GALLERY",
  story: "WEB_STORY",
  cartoon: "CARTOON",
};

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function timeAgo(d: Date | null): string {
  if (!d) return "";
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "ఇప్పుడే";
  if (m < 60) return `${m} నిమి.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} గం.`;
  return `${Math.floor(h / 24)} రోజులు`;
}

type Item = {
  title: string;
  summary: string | null;
  body: string | null;
  featuredImage: string | null;
  publishedAt: Date | null;
  viewCount: number;
  category: { name: string; color: string | null } | null;
  author: { name: string | null } | null;
  href: string;
};

async function fetchItems(source: string, category: string, count: number, featured: boolean): Promise<Item[]> {
  const take = clamp(count, 1, 30);

  // The "categories" source repeats over Category rows, not Content.
  if (source === "categories") {
    const cats = await prisma.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      take,
      select: { name: true, slug: true, description: true, color: true },
    });
    return cats.map((c) => ({
      title: c.name,
      summary: c.description,
      body: null,
      featuredImage: null,
      publishedAt: null,
      viewCount: 0,
      category: { name: c.name, color: c.color },
      author: null,
      href: categoryHref(c.slug),
    }));
  }

  const type = (SOURCE_TYPE[source] || "ARTICLE") as never;
  const rows = await prisma.content.findMany({
    where: {
      type,
      status: "PUBLISHED",
      ...(featured || source === "featured" ? { featured: true } : {}),
      ...(category
        ? { OR: [{ category: { slug: category } }, { additionalCategories: { some: { category: { slug: category } } } }] }
        : {}),
    },
    orderBy: { publishedAt: "desc" },
    take,
    select: {
      title: true,
      slug: true,
      summary: true,
      body: true,
      featuredImage: true,
      publishedAt: true,
      viewCount: true,
      category: { select: { name: true, slug: true, color: true } },
      author: { select: { name: true } },
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
  });
  return rows.map((r) => ({
    title: r.title,
    summary: r.summary,
    body: r.body,
    featuredImage: r.featuredImage,
    publishedAt: r.publishedAt,
    viewCount: r.viewCount,
    category: r.category,
    author: r.author,
    href: articleHref(r),
  }));
}

// Fill one element with a field's value.
function bindField(el: PNode, field: string, it: Item): void {
  switch (field) {
    case "title": el.set_content(esc(it.title)); break;
    case "summary": el.set_content(it.summary ? esc(it.summary) : ""); break;
    case "body": el.set_content(it.body || ""); break;
    case "category": el.set_content(it.category?.name ? esc(it.category.name) : ""); break;
    case "author": el.set_content(it.author?.name ? esc(it.author.name) : ""); break;
    case "date": el.set_content(timeAgo(it.publishedAt)); break;
    case "views": el.set_content(String(it.viewCount ?? 0)); break;
    case "link": if (el.tagName === "A") el.setAttribute("href", it.href); break;
    case "image": {
      const img = el.tagName === "IMG" ? el : el.querySelector("img");
      if (img) {
        if (it.featuredImage) img.setAttribute("src", it.featuredImage);
        img.setAttribute("alt", esc(it.title));
        img.setAttribute("loading", "lazy");
      } else if (it.featuredImage) {
        const prev = el.getAttribute("style") || "";
        el.setAttribute("style", `${prev};background-image:url('${esc(it.featuredImage)}');background-size:cover;background-position:center`);
      }
      break;
    }
  }
}

function bindCard(templateHtml: string, it: Item): string {
  const card = parse(templateHtml);
  card.querySelectorAll("[data-rsn-bind]").forEach((el) => bindField(el, el.getAttribute("data-rsn-bind") || "", it));
  // If the card root is a link and isn't itself a bound field, point it at the item.
  const link = card.querySelector("[data-rsn-card]") ?? card.querySelector("a");
  if (link && link.tagName === "A" && !link.getAttribute("data-rsn-bind")) link.setAttribute("href", it.href);
  return card.toString();
}

export async function expandDynamicBlocks(html: string): Promise<{ html: string; css: string }> {
  if (!html || !html.includes('data-rsn-block="latest-news"')) return { html, css: "" };
  const root = parse(html);
  const wrappers = root.querySelectorAll('[data-rsn-block="latest-news"]') as PNode[];
  if (!wrappers.length) return { html, css: "" };

  for (const w of wrappers) {
    const source = (w.getAttribute("data-source") || "latest").trim();
    const category = (w.getAttribute("data-category") || "").trim();
    const count = clamp(Number(w.getAttribute("data-count")) || 6, 1, 30);
    const columns = clamp(Number(w.getAttribute("data-columns")) || 3, 1, 6);
    const gap = clamp(Number(w.getAttribute("data-gap")) || 20, 0, 64);
    const featured = ["1", "true"].includes((w.getAttribute("data-featured") || "").toLowerCase());

    const cardEl = w.querySelector("[data-rsn-card]") ?? w.querySelector(".rsn-ln-card");
    const template = (cardEl ? cardEl.outerHTML : w.innerHTML.trim()) || DEFAULT_TEMPLATE;
    const items = await fetchItems(source, category, count, featured);
    const cardsHtml = items.length
      ? items.map((it) => bindCard(template, it)).join("")
      : `<div class="rsn-ln-empty">No items found.</div>`;
    if (cardEl) {
      const inner = w.innerHTML;
      const cardOuter = cardEl.outerHTML;
      w.set_content(inner.includes(cardOuter) ? inner.replace(cardOuter, cardsHtml) : cardsHtml);
    } else {
      w.set_content(cardsHtml);
    }

    const cls = w.getAttribute("class") || "";
    if (!cls.split(/\s+/).includes("rsn-ln")) w.setAttribute("class", `rsn-ln ${cls}`.trim());
    const prev = w.getAttribute("style") || "";
    w.setAttribute("style", `display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:${gap}px;${prev}`);
  }
  return { html: root.toString(), css: DYNAMIC_CSS };
}
