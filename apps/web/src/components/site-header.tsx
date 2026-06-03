// Server-side composition of the masthead header. Wraps the client
// <Header /> so we can fetch DB-driven slots (masthead ad, breaking ticker)
// in one place and stop forking the "remember to pass mastheadAdSlot"
// concern across every route.
//
// Drop-in replacement for <Header />: same config + breakingNews props.
// Pages that already passed tickerSlot or mastheadAdSlot can override.

import { Header } from "./header";
import { MastheadAdSlot } from "./masthead-ad-slot";
import { MarketTickerServer } from "./market-ticker-server";

type Props = {
  config?: Record<string, string>;
  breakingNews?: { id: string; text: string }[];
  // Allow per-page overrides if a route wants to suppress one of the slots.
  tickerSlot?: React.ReactNode;
  mastheadAdSlot?: React.ReactNode;
};

export function SiteHeader({
  config = {},
  breakingNews = [],
  tickerSlot,
  mastheadAdSlot,
}: Props) {
  return (
    <Header
      config={config}
      breakingNews={breakingNews}
      tickerSlot={tickerSlot ?? <MarketTickerServer />}
      mastheadAdSlot={mastheadAdSlot ?? <MastheadAdSlot config={config} />}
    />
  );
}
