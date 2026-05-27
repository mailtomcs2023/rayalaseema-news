// @rayalaseema/seo-schema — Spec #4 B0 (#196).
//
// JSON-LD generators consumed by apps/web (render) and apps/admin (preview).
// Shipping the package skeleton + shared types in B0; the actual generators
// land in B1 (#197 NewsArticle), B2 (#198 NewsMediaOrganization), B3 (#199
// BreadcrumbList), B4 (#200 Person). Re-exports added as each ships.
//
// Per spec rule: this package is TypeScript-only with no React deps so both
// admin (Next.js) and web (Next.js) workspaces can consume it without
// pulling unwanted runtime weight.

export * from "./types";
export { stringifyJsonLd } from "./serialize";
export { buildNewsArticleSchema } from "./news-article";
export { buildNewsMediaOrganizationSchema } from "./news-media-organization";
export type { EditorialPolicies, ContactPoint, AddressInput } from "./news-media-organization";
export { buildBreadcrumbListSchema } from "./breadcrumb-list";
export type { BreadcrumbItem } from "./breadcrumb-list";
