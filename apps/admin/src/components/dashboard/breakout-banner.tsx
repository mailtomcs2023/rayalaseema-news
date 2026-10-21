"use client";
// Dashboard alert (spec 12.11): a local story that three or more watched
// channels published in the last hour, or a 10x outlier with a town.
import Link from "next/link";
import { useEffect, useState } from "react";

type Breakout = { topicKey: string; channels: number; towns: string[]; sample: string };

export function BreakoutBanner() {
  const [items, setItems] = useState<Breakout[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/trending/breakouts").then((r) => (r.ok ? r.json() : { breakouts: [] })).then((j) => { if (alive) setItems(j.breakouts ?? []); }).catch(() => {});
    void load();
    const t = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!items.length) return null;
  return (
    <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#7f1d1d", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
      <strong>Breakout now:</strong>{" "}
      {items.slice(0, 3).map((b, i) => (
        <span key={b.topicKey}>
          {i > 0 && " · "}
          <Link href="/trending?window=6h&local=1" style={{ color: "#7f1d1d", textDecoration: "underline" }}>{b.sample}</Link>
          {" "}({b.towns.join(", ") || "statewide"}, {b.channels} channel{b.channels === 1 ? "" : "s"})
        </span>
      ))}
    </div>
  );
}
