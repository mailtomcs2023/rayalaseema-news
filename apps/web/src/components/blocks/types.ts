// Page Builder (Spec #2) — shared types for the block renderer + registry.

export interface PageContext {
  urlPath: string;
  // Derived from urlPath by the TemplateRenderer (e.g. "/category/sports" → "sports").
  // Blocks like SectionBand or AboveFold may use this for context-aware queries.
  categorySlug?: string;
  // Reader's pinned district (cookie-driven) — set by the home page wrapper.
  districtSlug?: string | null;
}
