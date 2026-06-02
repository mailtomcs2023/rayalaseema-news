"use client";

// Legacy client-side variant of the live-data strip. Fetches /api/tickers
// in a useEffect after hydration, which means the bar pops in ~300ms after
// the page is visible (a brief flash of empty space under BREAKING).
//
// New pages should pass `<MarketTickerServer />` as Header's tickerSlot
// prop instead; that variant server-renders the bar with content already
// in the HTML, eliminating the flash. This client variant remains the
// fallback for pages that haven't been migrated yet.
import { useState, useEffect } from "react";
import { MarketTickerView, type TickerData } from "./market-ticker-view";

export function MarketTicker() {
  const [data, setData] = useState<TickerData | null>(null);

  useEffect(() => {
    fetch("/api/tickers")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  return <MarketTickerView data={data} />;
}
