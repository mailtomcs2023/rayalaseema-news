// Page Builder (Spec #2) - shared types for the block renderer + registry.

export interface PageContext {
  urlPath: string;
  // Derived from urlPath by the TemplateRenderer (e.g. "/category/sports" → "sports").
  // Blocks like SectionBand or AboveFold may use this for context-aware queries.
  categorySlug?: string;
}

// One item of a Loop's data source. Heading/Image/Text primitives inside a Loop
// bind to these fields (see resolveBinding in block-renderer).
export interface LoopItem {
  id: string;
  title: string;
  summary: string | null;
  featuredImage: string | null;
  publishedAtIso: string | null;
  categoryName: string | null;
  href: string;
}
