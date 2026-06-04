// Server-side composition of the masthead header. Wraps the client
// <Header /> so we can fetch DB-driven slots (masthead ad, breaking ticker)
// in one place and stop forking the "remember to pass mastheadAdSlot"
// concern across every route.
//
// Drop-in replacement for <Header />: same config + breakingNews props.
// Pages that already passed tickerSlot or mastheadAdSlot can override.

import { Header } from "./header";
import { MastheadAdSlot } from "./masthead-ad-slot";
import { getMenuItems } from "@/lib/menu";

type Props = {
  config?: Record<string, string>;
  breakingNews?: { id: string; text: string }[];
  // Allow per-page overrides if a route wants to suppress one of the slots.
  // tickerSlot is retained for back-compat but the top ticker bar was retired
  // (prices now live in the section headers), so it is no longer rendered.
  tickerSlot?: React.ReactNode;
  mastheadAdSlot?: React.ReactNode;
};

export async function SiteHeader({
  config = {},
  breakingNews = [],
  mastheadAdSlot,
}: Props) {
  // Fetch the admin-published HEADER + MOBILE menus on the server so the nav is
  // in the initial HTML (no empty-flash on refresh) and always reflects the
  // latest publish. Cached + revalidated via lib/menu.ts.
  const [headerItems, mobileItems] = await Promise.all([
    getMenuItems("HEADER"),
    getMenuItems("MOBILE"),
  ]);
  return (
    <Header
      config={config}
      breakingNews={breakingNews}
      headerItems={headerItems}
      mobileItems={mobileItems}
      mastheadAdSlot={mastheadAdSlot ?? <MastheadAdSlot config={config} />}
    />
  );
}
