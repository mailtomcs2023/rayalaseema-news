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
import { headers } from "next/headers";
import { MarketTickerView, type TickerData } from "./market-ticker-view";

async function getTickerData(): Promise<TickerData | null> {
  // Build an absolute URL because server-side fetch can't use relative paths.
  // Using request headers (instead of an env var) keeps this working across
  // local dev, preview, and prod without configuration.
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  try {
    const res = await fetch(`${protocol}://${host}/api/tickers`, {
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
