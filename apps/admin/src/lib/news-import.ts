/**
 * Shared news-ingestion primitives. Used by both:
 *   - /api/auto-fetch (NewsData.io per-category pipeline)
 *   - /api/auto-fetch-pti (PTI wire pipeline)
 *
 * Keeping importOneArticle in one place means the Eenadu-grade 3-step
 * pipeline, dedup, slug-collision retries, and image rehosting all stay
 * in lockstep across providers.
 */

import { prisma } from "@rayalaseema/db";
import { buildSlugFromTitle, uniqueSlug } from "./slug";
import { uploadImageFromUrl } from "./blob";
import { runPipeline } from "./ai/pipeline";
import { AIContentFilterError } from "./ai/client";

// Sentinel thrown by importOneArticle when Azure's content filter blocked
// the article. Callers catch it to bump per-category `blocked` counters
// without polluting the success/failure paths.
export class ArticleBlockedByFilter extends Error {
  readonly categories: string[];
  constructor(categories: string[]) {
    super(`blocked by AI content filter (${categories.join(", ") || "unknown"})`);
    this.name = "ArticleBlockedByFilter";
    this.categories = categories;
  }
}

// Common shape consumed by importOneArticle. NewsData.io callers map
// their raw response into this; PTI callers do the same. `link` is the
// dedup key against Content.sourceUrl.
export interface RawArticle {
  article_id?: string;
  title?: string;
  description?: string;
  content?: string;
  image_url?: string | null;
  link?: string;
  source_id?: string;
  pubDate?: string;
}

// Generate a unique slug, mutating the passed-in set so subsequent calls
// in the same batch don't collide with siblings.
export function generateSlug(title: string, existingSlugs: Set<string>): string {
  const base = buildSlugFromTitle(title);
  const final = uniqueSlug(base, existingSlugs);
  existingSlugs.add(final);
  return final;
}

// Import one article into Content. Returns true on success, false on
// skip (dedup miss / too-short / slug retries exhausted / sourceUrl
// uniqueness collision against a soft-deleted row).
//
// Throws ArticleBlockedByFilter when Azure Responsible AI rejects the
// source - callers count these separately and surface in results.
export async function importOneArticle(
  article: RawArticle,
  categoryId: string,
  constituencyId: string | undefined,
  existingSourceSet: Set<unknown>,
  existingSlugs: Set<string>,
  adminId: string,
  forceReimport: boolean,
): Promise<boolean> {
  const content = article.content || article.description || article.title || "";
  if (!article.title || content.length < 20) return false;

  // Dedup. Skip (default) or hard-delete + recreate (forceReimport).
  if (article.link && existingSourceSet.has(article.link)) {
    if (!forceReimport) return false;
    const existing = await prisma.content.findFirst({
      where: { sourceUrl: article.link, deletedAt: { not: undefined } },
      select: { id: true, slug: true },
    });
    if (existing) {
      await prisma.content.delete({ where: { id: existing.id } });
      existingSourceSet.delete(article.link);
      if (existing.slug) existingSlugs.delete(existing.slug);
    }
  }

  // Eenadu-grade 3-step pipeline. body_html_te already opens with the
  // <p class="dek"> per compose's HTML rule, so no extra prepend.
  const sourceForPipeline = `${article.title}\n\n${content}`;
  let translated: { title: string; summary: string; body: string };
  try {
    const result = await runPipeline(sourceForPipeline);
    translated = {
      title: result.article.title_te || article.title,
      summary: result.article.summary_te || content.substring(0, 200),
      body: result.article.body_html_te,
    };
  } catch (e) {
    if (e instanceof AIContentFilterError) {
      console.warn("[news-import] content filter blocked:", e.categories.join(", "));
      throw new ArticleBlockedByFilter(e.categories);
    }
    // Other pipeline failures (rate limit, transient model error) - fall
    // back to a minimal English-as-Telugu placeholder so the row at least
    // lands in DRAFT and the editor can fix it manually.
    console.error("[news-import] pipeline failed:", e);
    translated = { title: article.title, summary: content.substring(0, 200), body: `<p>${content}</p>` };
  }
  const slug = generateSlug(article.title, existingSlugs);
  const hostedImage = article.image_url ? await uploadImageFromUrl(article.image_url) : null;

  let finalSlug = slug;
  let created = false;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    try {
      await prisma.content.create({
        data: {
          type: "ARTICLE",
          title: translated.title,
          slug: finalSlug,
          summary: translated.summary,
          body: translated.body,
          categoryId,
          authorId: adminId,
          featuredImage: hostedImage,
          sourceUrl: article.link || null,
          status: "DRAFT",
          featured: false,
          language: "TELUGU",
          publishedAt: null,
          constituencyId: constituencyId || null,
        },
      });
      created = true;
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("Unique constraint") && msg.includes("slug")) {
        finalSlug = `${slug}-${Date.now()}-${attempt + 1}`;
        continue;
      }
      if (msg.includes("Unique constraint") && msg.includes("sourceUrl")) {
        return false;
      }
      throw e;
    }
  }
  if (created && article.link) existingSourceSet.add(article.link);
  return created;
}

// Prelude shared by both auto-fetch routes. Returns the admin author, the
// in-DB category slug→id map, and the dedup sets covering live + trashed
// Content rows.
export async function loadImportPrelude(): Promise<{
  admin: { id: string };
  categoryMap: Record<string, string>;
  existingSlugs: Set<string>;
  existingSourceSet: Set<unknown>;
}> {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No admin user");

  // Existing slugs + source URLs across ALL Content rows including trashed.
  // The DB unique indexes span every row regardless of soft-delete state,
  // so dedup must too. The prisma client extension hides trashed rows by
  // default - we work around it via an explicit deletedAt filter.
  const [activeItems, trashedItems] = await Promise.all([
    prisma.content.findMany({ select: { slug: true, sourceUrl: true } }),
    prisma.content.findMany({
      where: { deletedAt: { not: null } },
      select: { slug: true, sourceUrl: true },
    }),
  ]);
  const existingItems = [...activeItems, ...trashedItems];
  const existingSlugs = new Set(existingItems.map((a) => a.slug).filter(Boolean) as string[]);
  const existingSourceSet = new Set(existingItems.map((a) => a.sourceUrl).filter(Boolean));

  const dbCategories = await prisma.category.findMany();
  const categoryMap: Record<string, string> = {};
  dbCategories.forEach((c) => (categoryMap[c.slug] = c.id));

  return { admin: { id: admin.id }, categoryMap, existingSlugs, existingSourceSet };
}
