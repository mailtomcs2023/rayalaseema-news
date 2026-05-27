// BreadcrumbList JSON-LD generator. Spec #4 B3 (#199).
//
// Article + hub + author + tag pages all emit BreadcrumbList — extracting it
// into a single generator keeps the schema consistent and lets us upgrade
// position-handling / encoding rules in one place if Google changes them.
//
// Google's BreadcrumbList rich result is one of the few still rewarded with
// visible SERP surface in 2026 (most others died with the May 2026 schema
// purge). Cheap, universal, ship everywhere.

import type { JsonLd } from "./types";

export interface BreadcrumbItem {
  /** Human-readable label shown to crawlers + voice assistants. */
  name: string;
  /** Absolute URL of the item. Omit on the last (current-page) item. */
  url?: string;
}

interface BuildArgs {
  items: BreadcrumbItem[];
}

/**
 * Returns the BreadcrumbList JSON-LD payload. `position` is auto-numbered
 * starting at 1. Items without a `url` (typically the last "you are here"
 * crumb) emit just a name on the ListItem — schema.org allows this for the
 * current page.
 */
export function buildBreadcrumbListSchema(args: BuildArgs): JsonLd {
  const { items } = args;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, idx) => {
      const listItem: Record<string, unknown> = {
        "@type": "ListItem",
        position: idx + 1,
        name: it.name,
      };
      if (it.url) listItem.item = it.url;
      return listItem;
    }),
  };
}
