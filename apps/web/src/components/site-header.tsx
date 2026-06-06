// Server-side composition of the masthead header. Wraps the client
// <Header /> so we can fetch DB-driven slots (masthead ad, breaking ticker)
// in one place and stop forking the "remember to pass mastheadAdSlot"
// concern across every route.
//
// Drop-in replacement for <Header />: same config + breakingNews props.
// Pages that already passed tickerSlot or mastheadAdSlot can override.

import { Header } from "./header";
import { MastheadAdSlot } from "./masthead-ad-slot";
import { getMenuItems, type MenuItem } from "@/lib/menu";

type Props = {
  config?: Record<string, string>;
  breakingNews?: { id: string; text: string }[];
  // Allow per-page overrides if a route wants to suppress one of the slots.
  // tickerSlot is retained for back-compat but the top ticker bar was retired
  // (prices now live in the section headers), so it is no longer rendered.
  tickerSlot?: React.ReactNode;
  mastheadAdSlot?: React.ReactNode;
  // The section the current page belongs to (a category or district slug).
  // Section hubs pass their own slug; content pages pass their primary
  // category's slug; constituency/mandal pages pass their district slug. When it
  // matches a HEADER item with an enabled secondary header, that sub-nav renders
  // below the primary bar. Pages that omit it get no secondary header - and pay
  // no extra cost, keeping their static/ISR rendering intact.
  activeSectionSlug?: string | null;
};

// The bare section slug a HEADER top item represents, or null if it isn't a
// section. Mirrors isSectionTarget() in the admin editor.
function sectionSlugOf(it: MenuItem): string | null {
  const t = it.target as any;
  if (!t) return null;
  if (t.type === "CATEGORY") return t.categorySlug ?? null;
  if (t.type === "DISTRICT") return t.districtSlug ?? null;
  if (t.type === "INTERNAL_URL") {
    const m = String(t.url || "").match(/^\/([^/?#]+)$/);
    return m ? m[1] : null;
  }
  return null;
}

export async function SiteHeader({
  config = {},
  breakingNews = [],
  mastheadAdSlot,
  activeSectionSlug,
}: Props) {
  // Fetch the admin-published HEADER + MOBILE menus on the server so the nav is
  // in the initial HTML (no empty-flash on refresh) and always reflects the
  // latest publish. Cached + revalidated via lib/menu.ts.
  const [headerItems, mobileItems] = await Promise.all([
    getMenuItems("HEADER"),
    getMenuItems("MOBILE"),
  ]);

  // Resolve the section sub-nav for this page: find the HEADER section item
  // matching activeSectionSlug whose secondary header is enabled and that has
  // nested sub-items (the sub-items ARE the secondary links). Reuses the
  // already-fetched headerItems - no extra query.
  const matched = activeSectionSlug
    ? headerItems.find(
        (it) =>
          (it as any).secondaryHeader?.enabled &&
          Array.isArray((it as any).children) &&
          (it as any).children.length > 0 &&
          sectionSlugOf(it) === activeSectionSlug,
      )
    : undefined;
  const secondaryItems = matched ? (matched as any).children : undefined;
  const secondaryParentTarget = matched ? (matched as any).target : undefined;
  const secondarySticky = matched ? !!(matched as any).secondaryHeader?.sticky : undefined;

  return (
    <Header
      config={config}
      breakingNews={breakingNews}
      headerItems={headerItems}
      mobileItems={mobileItems}
      secondaryItems={secondaryItems}
      secondaryParentTarget={secondaryParentTarget}
      secondarySticky={secondarySticky}
      mastheadAdSlot={mastheadAdSlot ?? <MastheadAdSlot config={config} />}
    />
  );
}
