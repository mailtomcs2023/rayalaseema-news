"use client";

import { useState, useEffect } from "react";

interface TickerData {
  mandi: any[];
  bullion: any[];
  forex: any[];
  cricket: any[] | null;
}

// Shared data - fetched once, used by all widgets
let cachedData: TickerData | null = null;
let fetchPromise: Promise<TickerData> | null = null;

function useTickerData() {
  const [data, setData] = useState<TickerData | null>(cachedData);

  useEffect(() => {
    if (cachedData) { setData(cachedData); return; }
    if (!fetchPromise) {
      fetchPromise = fetch("/api/tickers")
        .then((r) => r.json())
        .then((d) => { cachedData = d; return d; })
        .catch(() => ({ mandi: [], bullion: [], forex: [], cricket: null }));
    }
    fetchPromise.then(setData);
  }, []);

  return data;
}

// ===== Monoline SVG icons (replace pixel emoji for sharp brand-tinted glyphs) =====
const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const IconCoin    = () => <Icon><circle cx="12" cy="12" r="9"/><path d="M9 8h4a2 2 0 010 4H9m0 0h4a2 2 0 010 4H9m3-8v10"/></Icon>;
const IconExchange= () => <Icon><path d="M3 8h15l-3-3"/><path d="M21 16H6l3 3"/></Icon>;
const IconBat     = () => <Icon><path d="M14.5 4.5l5 5-9 9-5-5z"/><circle cx="5" cy="19" r="1.5" fill="currentColor"/></Icon>;
const IconGrain   = () => <Icon><path d="M12 22V6"/><path d="M12 10c-3 0-5-2-5-5 3 0 5 2 5 5z"/><path d="M12 14c-3 0-5-2-5-5 3 0 5 2 5 5z"/><path d="M12 18c-3 0-5-2-5-5 3 0 5 2 5 5z"/><path d="M12 10c3 0 5-2 5-5-3 0-5 2-5 5z"/><path d="M12 14c3 0 5-2 5-5-3 0-5 2-5 5z"/><path d="M12 18c3 0 5-2 5-5-3 0-5 2-5 5z"/></Icon>;
const PulseDot    = () => <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--danger)", display: "inline-block" }} />;

// ===== Shared row styles =====
const rowStyle = (last: boolean): React.CSSProperties => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "var(--sp-2) 0",
  borderBottom: last ? "none" : "1px solid var(--paper-edge)",
});
const listStyle: React.CSSProperties = { listStyle: "none", padding: "var(--sp-1) var(--sp-3) var(--sp-2)", margin: 0 };
const wrapStyle: React.CSSProperties = { marginTop: "var(--sp-2)" };

// ===== BULLION =====
export function BullionWidget() {
  const data = useTickerData();
  if (!data?.bullion?.length) return null;

  return (
    <div className="panel" style={wrapStyle}>
      <div className="section-head">
        <span className="section-head__icon"><IconCoin /></span>
        <span className="section-head__label">బంగారం &amp; వెండి</span>
        <span className="section-head__tail">live</span>
      </div>
      <ul style={listStyle}>
        {data.bullion.map((b: any, i: number) => (
          <li key={i} style={rowStyle(i >= data.bullion.length - 1)}>
            <span style={{ fontSize: "var(--t-sm)", fontWeight: "var(--w-emp)" as any, color: "var(--n-700)" }}>{b.name}</span>
            <div style={{ textAlign: "right" }}>
              <div>
                <span style={{ fontSize: "var(--t-md)", fontWeight: "var(--w-head)" as any, color: "var(--n-900)" }}>{"₹"}{b.price.toLocaleString()}</span>
                <span style={{ fontSize: "var(--t-xs)", color: "var(--n-500)", marginLeft: 2 }}>/{b.unit}</span>
              </div>
              {b.change !== 0 && (
                <div style={{ fontSize: "var(--t-xs)", fontWeight: "var(--w-emp)" as any, color: b.change > 0 ? "var(--success)" : "var(--danger)" }}>
                  {b.change > 0 ? "▲" : "▼"} {Math.abs(b.change)}%
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===== FOREX - 2-col grid (flag + code stacked w/ price; distinct from Bullion's row list) =====
export function ForexWidget() {
  const data = useTickerData();
  if (!data?.forex?.length) return null;

  return (
    <div className="panel" style={wrapStyle}>
      <div className="section-head">
        <span className="section-head__icon"><IconExchange /></span>
        <span className="section-head__label">ఫారెక్స్</span>
        <span className="section-head__tail">live</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-1)", padding: "var(--sp-2) var(--sp-3) var(--sp-3)" }}>
        {data.forex.slice(0, 6).map((f: any, i: number) => (
          <div key={i} style={{ padding: "var(--sp-2)", background: "var(--n-50)", borderRadius: "var(--r-sm)", display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {f.flag && <span style={{ fontSize: 14, lineHeight: 1 }} aria-hidden>{f.flag}</span>}
              <span style={{ fontSize: 10, fontWeight: "var(--w-head)" as any, color: "var(--n-500)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{f.name.split("/")[0]}</span>
            </div>
            <span style={{ fontSize: "var(--t-md)", fontWeight: "var(--w-head)" as any, color: "var(--n-900)", lineHeight: 1.1 }}>{"₹"}{f.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== CRICKET =====
export function CricketWidget() {
  const data = useTickerData();
  if (!data?.cricket || !Array.isArray(data.cricket) || data.cricket.length === 0) return null;

  return (
    <div className="panel" style={wrapStyle}>
      <div className="section-head">
        <span className="section-head__icon"><IconBat /></span>
        <span className="section-head__label">లైవ్ క్రికెట్</span>
        <span style={{ marginLeft: "auto" }}><PulseDot /></span>
      </div>
      <ul style={listStyle}>
        {data.cricket.map((m: any, i: number) => (
          <li key={m.id || i} style={{ padding: "var(--sp-2) 0", borderBottom: i < data.cricket!.length - 1 ? "1px solid var(--paper-edge)" : "none" }}>
            <p style={{ fontSize: "var(--t-sm)", fontWeight: "var(--w-emp)" as any, color: "var(--n-900)", margin: 0 }}>{m.name}</p>
            {m.score?.length > 0 && m.score.map((s: any, j: number) => (
              <p key={j} style={{ fontSize: "var(--t-sm)", fontWeight: "var(--w-head)" as any, color: "var(--n-900)", margin: "var(--sp-1) 0 0" }}>
                {s.team}: {s.runs}/{s.wickets} ({s.overs} ov)
              </p>
            ))}
            <p style={{ fontSize: "var(--t-xs)", color: "var(--n-500)", margin: "var(--sp-1) 0 0" }}>{m.status}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===== MANDI - stacked card per commodity, market as chip (distinct from Bullion row + Forex grid) =====
export function MandiWidget() {
  const data = useTickerData();
  if (!data?.mandi?.length) return null;

  const items = data.mandi.slice(0, 6);
  return (
    <div className="panel" style={wrapStyle}>
      <div className="section-head">
        <span className="section-head__icon"><IconGrain /></span>
        <span className="section-head__label">మండి ధరలు</span>
      </div>
      <div style={{ padding: "var(--sp-2) var(--sp-3) var(--sp-3)", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
        {items.map((m: any, i: number) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--sp-2)", borderLeft: `3px solid ${m.change > 0 ? "var(--success)" : m.change < 0 ? "var(--danger)" : "var(--paper-edge)"}`, background: "var(--n-50)", borderRadius: "0 var(--r-sm) var(--r-sm) 0" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: "var(--t-sm)", fontWeight: "var(--w-head)" as any, color: "var(--n-900)" }}>{m.commodity}</span>
              <span style={{ fontSize: 10, fontWeight: "var(--w-emp)" as any, color: "var(--n-500)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{m.market}</span>
            </div>
            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 0 }}>
              <span style={{ fontSize: "var(--t-md)", fontWeight: "var(--w-head)" as any, color: "var(--n-900)", lineHeight: 1.1 }}>{"₹"}{m.price.toLocaleString()}</span>
              {m.change !== 0 && (
                <span style={{ fontSize: 10, fontWeight: "var(--w-emp)" as any, color: m.change > 0 ? "var(--success)" : "var(--danger)" }}>
                  {m.change > 0 ? "▲" : "▼"}{Math.abs(m.change)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
