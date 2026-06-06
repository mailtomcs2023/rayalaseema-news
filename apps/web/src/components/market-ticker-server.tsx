// Server-side variant of MarketTicker. Fetches /api/tickers at request
// time and server-renders the dark strip with content already filled in.
// Result: the bar appears on first paint - no client-side flash of empty
// content during refresh, no layout shift.
//
// Page authors render this as `<Header tickerSlot={<MarketTickerServer />} />`
// (Header is a client component, but Server Components passed via props
// across the client boundary still server-render). Pages that don't pass
// tickerSlot fall back to the legacy client-fetched MarketTicker inside
// Header so existing pages keep working without per-page edits.
import { MarketTickerView, type TickerData } from "./market-ticker-view";

// Static base URL via env var, NOT next/headers(). headers() opted every
// page that mounted the ticker into dynamic rendering (revalidate=N was
// silently ignored). Pages can now stay statically rendered + cacheable.
const TICKERS_URL = `${process.env.SITE_URL || "http://localhost:3000"}/api/tickers`;

async function getTickerData(): Promise<TickerData | null> {
  try {
    const res = await fetch(TICKERS_URL, {
      // Match the in-memory cache window of /api/tickers itself (5 min) so
      // the server fetch never hits external APIs more than once per window
      // even under traffic. The route already has its own cache layer; this
      // is belt-and-suspenders.
      next: { revalidate: 300, tags: ["tickers"] },
    });
    if (!res.ok) return null;
    return (await res.json()) as TickerData;
  } catch {
    return null;
  }
}

export async function MarketTickerServer() {
  const data = await getTickerData();
  return <MarketTickerView data={data} />;
}
