// Spec #4 K9 (#254) — Discover-readiness checklist.
//
// Blocks publish if the article would tank Discover ranking per Feb 2026
// Discover core update analysis. Soft-warn for non-blockers; hard-block
// for criticals.
//
// Hooked into /api/content/[id] PUT before the publish transition fires.

interface ChecklistInput {
  title: string;
  summary?: string | null;
  body?: string | null;
  featuredImage?: string | null;
  ogImage?: string | null;
  category?: { slug: string } | null;
  authorId?: string | null;
}

export interface ChecklistFinding {
  level: "block" | "warn";
  code: string;
  message: string;
}

/**
 * Return findings — empty array means publish is clear.
 * Caller treats `block`-level findings as hard refusal; `warn` is editor-visible
 * but proceeds on confirmation.
 */
export function discoverReadinessCheck(input: ChecklistInput): ChecklistFinding[] {
  const f: ChecklistFinding[] = [];

  if (!input.title || input.title.trim().length === 0) {
    f.push({ level: "block", code: "NO_TITLE", message: "Article has no title." });
  } else if (input.title.length > 110) {
    f.push({ level: "warn", code: "TITLE_TOO_LONG", message: `Title is ${input.title.length} chars; Discover demotes >110 chars.` });
  }

  if (!input.featuredImage && !input.ogImage) {
    f.push({ level: "block", code: "NO_IMAGE", message: "Article has no featured image. Discover requires one ≥ 1200px wide." });
  }

  if (!input.authorId) {
    f.push({ level: "warn", code: "NO_AUTHOR", message: "Article has no author. Person.url anchor is a strong Discover signal." });
  }

  if (!input.category) {
    f.push({ level: "warn", code: "NO_CATEGORY", message: "Article has no category. Limits sitemap + RSS coverage." });
  }

  if (!input.summary || input.summary.trim().length < 40) {
    f.push({ level: "warn", code: "SUMMARY_THIN", message: "Article summary is missing or thin (<40 chars). Hurts meta description + OG snippet quality." });
  }

  // Clickbait heuristic — "you won't believe", "shocking", "this one trick" etc.
  // Feb 2026 Discover update demoted clickbait hard; flag for editor review.
  const clickbaitRe = /\b(you won['’]t believe|shocking|this one (trick|secret)|doctors hate|don['’]t want you to know)\b/i;
  if (input.title && clickbaitRe.test(input.title)) {
    f.push({ level: "warn", code: "CLICKBAIT", message: "Title matches Discover-demoted clickbait patterns. Reword for the news desk register." });
  }

  if (input.body && input.body.length < 600) {
    f.push({ level: "warn", code: "BODY_THIN", message: "Article body is < 600 chars. Discover prefers substance over snippet articles." });
  }

  return f;
}
