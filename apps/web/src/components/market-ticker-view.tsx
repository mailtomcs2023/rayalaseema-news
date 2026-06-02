// Pure presentational view for the live-data strip. No hooks, no state -
// renders the supplied data into the dark bar that sits under BREAKING.
// Used by:
//   - MarketTickerServer (server-side fetch + render, zero flash on first paint)
//   - MarketTicker (legacy client-side fetch, fallback for pages not yet migrated)
import { Trophy, Coins, IndianRupee, Sprout, TrendingUp, TrendingDown } from "lucide-react";

export interface CricketMatch {
  id: string;
  name: string;
  status: string;
  isLive?: boolean;
  score?: { team: string; runs: number; wickets: number; overs: number }[];
}

export interface TickerData {
  mandi: { commodity: string; market: string; price: number; unit: string; change: number }[];
  bullion: { name: string; nameEn: string; price: number; unit: string; change: number }[];
  forex: { name: string; price: number; icon: string }[];
  cricket: CricketMatch[] | null;
}

function renderCricketLine(m: CricketMatch) {
  const scoreLine = (m.score ?? [])
    .map((s) => `${s.team} ${s.runs}/${s.wickets}${s.overs ? ` (${s.overs})` : ""}`)
    .join(" v ");
  return scoreLine || m.name;
}

export function MarketTickerView({ data }: { data: TickerData | null }) {
  // Always render the bar (and its <style>) so the page reserves this strip's
  // height even before data arrives. The client <MarketTicker> fetches in a
  // useEffect (~300ms after hydration); returning null until then made the bar
  // pop in and shove the page down (layout shift) on every non-home page.
  // While loading/empty we render an invisible placeholder row sized like the
  // populated bar, so the data fills in with no jump.
  const cricketMatches = data && Array.isArray(data.cricket) ? data.cricket : [];
  const hasAny =
    !!data &&
    (data.mandi.length > 0 ||
      data.bullion.length > 0 ||
      data.forex.length > 0 ||
      cricketMatches.length > 0);

  return (
    <div className="market-ticker-bar" aria-hidden={hasAny ? undefined : true}>
      <div className="market-ticker-scroll">
        <div className="market-ticker-content">
          {!hasAny && (
            <span className="ticker-section-label" style={{ visibility: "hidden" }}>
              &nbsp;
            </span>
          )}
          {hasAny && data && (
            <>
          {cricketMatches.length > 0 && (
            <>
              <span className="ticker-section-label" style={{ background: "#16a34a" }}>
                <Trophy size={11} strokeWidth={2.5} aria-hidden />
                {"క్రికెట్"}
              </span>
              {cricketMatches.slice(0, 2).map((m) => (
                <span key={m.id} className="ticker-item">
                  <span className="ticker-text">
                    {m.isLive ? "" : "Next: "}{m.name}
                  </span>
                  <span className="ticker-value">{renderCricketLine(m)}</span>
                  <span className="ticker-status">{m.status}</span>
                </span>
              ))}
              <span className="ticker-divider">|</span>
            </>
          )}

          {data.bullion.length > 0 && (
            <>
              <span className="ticker-section-label" style={{ background: "#b45309" }}>
                <Coins size={11} strokeWidth={2.5} aria-hidden />
                {"బులియన్"}
              </span>
              {data.bullion.map((b, i) => (
                <span key={i} className="ticker-item">
                  <span className="ticker-name">{b.name}</span>
                  <span className="ticker-value">{"₹"}{b.price.toLocaleString()}/{b.unit}</span>
                  {b.change !== 0 && (
                    <span className={`ticker-change ${b.change > 0 ? "up" : "down"}`}>
                      {b.change > 0
                        ? <TrendingUp size={10} strokeWidth={2.5} aria-hidden />
                        : <TrendingDown size={10} strokeWidth={2.5} aria-hidden />}
                      {Math.abs(b.change)}%
                    </span>
                  )}
                </span>
              ))}
              <span className="ticker-divider">|</span>
            </>
          )}

          {data.forex.length > 0 && (
            <>
              <span className="ticker-section-label" style={{ background: "#1d4ed8" }}>
                <IndianRupee size={11} strokeWidth={2.5} aria-hidden />
                {"ఫారెక్స్"}
              </span>
              {data.forex.map((f, i) => (
                <span key={i} className="ticker-item">
                  <span className="ticker-name">{f.icon} {f.name}</span>
                  <span className="ticker-value">{"₹"}{f.price}</span>
                </span>
              ))}
              <span className="ticker-divider">|</span>
            </>
          )}

          {data.mandi.length > 0 && (
            <>
              <span className="ticker-section-label" style={{ background: "#15803d" }}>
                <Sprout size={11} strokeWidth={2.5} aria-hidden />
                {"మండి"}
              </span>
              {data.mandi.map((m, i) => (
                <span key={i} className="ticker-item">
                  <span className="ticker-name">{m.commodity} ({m.market})</span>
                  <span className="ticker-value">{"₹"}{m.price.toLocaleString()}/{m.unit}</span>
                  {m.change !== 0 && (
                    <span className={`ticker-change ${m.change > 0 ? "up" : "down"}`}>
                      {m.change > 0
                        ? <TrendingUp size={10} strokeWidth={2.5} aria-hidden />
                        : <TrendingDown size={10} strokeWidth={2.5} aria-hidden />}
                      {Math.abs(m.change)}%
                    </span>
                  )}
                </span>
              ))}
            </>
          )}
            </>
          )}
        </div>
      </div>

      <style>{`
        .market-ticker-bar {
          background: #111827;
          overflow: hidden;
          white-space: nowrap;
          font-family: "Inter", "Noto Sans Telugu", sans-serif;
        }
        .market-ticker-scroll {
          overflow-x: auto;
          overflow-y: hidden;
          padding: 4px 0;
          scrollbar-width: none;
        }
        .market-ticker-scroll::-webkit-scrollbar { display: none; }
        .market-ticker-content {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .ticker-section-label {
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 3px;
          flex-shrink: 0;
          margin-left: 16px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .ticker-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin: 0 8px;
        }
        .ticker-name {
          color: #9ca3af;
          font-size: 11px;
          font-weight: 500;
        }
        .ticker-value {
          color: #fff;
          font-size: 12px;
          font-weight: 700;
        }
        .ticker-text {
          color: #d1d5db;
          font-size: 11px;
        }
        .ticker-status {
          color: #fbbf24;
          font-size: 10px;
          font-weight: 600;
          margin-left: 4px;
        }
        .ticker-change {
          font-size: 10px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }
        .ticker-change.up { color: #4ade80; }
        .ticker-change.down { color: #f87171; }
        .ticker-divider {
          color: #374151;
          margin: 0 4px;
        }
      `}</style>
    </div>
  );
}
