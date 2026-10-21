"use client";
// Trending desk screen (spec 12.11): what the 14+ watched Telugu channels
// published, ranked by velocity or outlier ratio, with topic clusters and a
// one-click "Create story" that opens a prefilled DRAFT.
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ToastViewport, useToasts } from "@/components/toast";

type Item = { videoId: string; title: string; publishedAt: string; views: number; velocity: number; outlier: number; towns: string[]; topicKey: string | null; isShort: boolean; durationSec: number | null; channel: { name: string; tier: number } };
type Cluster = { topicKey: string; channels: number; towns: string[]; views: number; titles: string[]; videoIds: string[]; patterns: string[] };

const chip: React.CSSProperties = { display: "inline-block", padding: "2px 8px", borderRadius: 999, background: "#f3f4f6", fontSize: 12, margin: 2 };
const btn: React.CSSProperties = { padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const sel: React.CSSProperties = { padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, background: "#fff" };

const ago = (iso: string) => {
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
};
const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
const outlierTone = (x: number) => (x >= 10 ? "#fee2e2" : x >= 3 ? "#fef3c7" : "#f3f4f6");

export function TrendingTable() {
  const router = useRouter();
  const params = useSearchParams();
  const [window_, setWindow] = useState(params.get("window") ?? "24h");
  const [kind, setKind] = useState(params.get("kind") ?? "all");
  const [local, setLocal] = useState(params.get("local") === "1");
  const [live, setLive] = useState(false);
  const [sort, setSort] = useState(params.get("sort") ?? "velocity");
  const [view, setView] = useState<"videos" | "clusters">("videos");
  const [data, setData] = useState<{ items: Item[]; clusters: Cluster[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  const load = useCallback(async () => {
    const q = new URLSearchParams({ window: window_, kind, sort, ...(local ? { local: "1" } : {}), ...(live ? { live: "1" } : {}) });
    const r = await fetch(`/api/trending?${q}`);
    if (r.ok) setData(await r.json());
  }, [window_, kind, local, live, sort]);
  useEffect(() => { void load(); }, [load]);

  async function createStory(videoId: string) {
    setBusy(videoId);
    try {
      const r = await fetch("/api/trending/create-story", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ videoId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      router.push(`/content/${j.contentId}`);
    } catch (e) {
      push("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <select style={sel} value={window_} onChange={(e) => setWindow(e.target.value)}><option value="6h">Last 6 hours</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option></select>
        <select style={sel} value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">All formats</option><option value="short">Shorts</option><option value="long">Long videos</option></select>
        <select style={sel} value={sort} onChange={(e) => setSort(e.target.value)}><option value="velocity">Fastest (views/hour)</option><option value="outlier">Outliers (vs channel normal)</option></select>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} /> Rayalaseema towns only</label>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> include LIVE streams</label>
        <span style={{ flex: 1 }} />
        <button type="button" style={{ ...btn, background: view === "videos" ? "#fee2e2" : "#fff" }} onClick={() => setView("videos")}>Videos</button>
        <button type="button" style={{ ...btn, background: view === "clusters" ? "#fee2e2" : "#fff" }} onClick={() => setView("clusters")}>Stories across channels</button>
      </div>

      {!data && <div style={{ color: "#6b7280" }}>Loading…</div>}

      {data && view === "videos" && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", borderRadius: 8 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6b7280" }}>
              <th style={{ padding: 8 }}>Channel</th><th style={{ padding: 8 }}>Title</th><th style={{ padding: 8 }}>Age</th><th style={{ padding: 8, textAlign: "right" }}>Views</th><th style={{ padding: 8, textAlign: "right" }}>Views/h</th><th style={{ padding: 8 }}>Outlier</th><th style={{ padding: 8 }}>Towns</th><th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((v) => (
              <tr key={v.videoId} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={{ padding: 8, whiteSpace: "nowrap" }}>{v.channel.name}{v.isShort && <span style={{ ...chip, marginLeft: 4 }}>Short</span>}</td>
                <td style={{ padding: 8 }}><a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noreferrer" style={{ color: "#111827" }}>{v.title}</a></td>
                <td style={{ padding: 8, whiteSpace: "nowrap" }}>{ago(v.publishedAt)}</td>
                <td style={{ padding: 8, textAlign: "right" }}>{fmt(v.views)}</td>
                <td style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>{fmt(v.velocity)}</td>
                <td style={{ padding: 8 }}><span style={{ ...chip, background: outlierTone(v.outlier) }}>×{v.outlier.toFixed(1)}</span></td>
                <td style={{ padding: 8 }}>{v.towns.map((t) => <span key={t} style={chip}>{t}</span>)}</td>
                <td style={{ padding: 8, whiteSpace: "nowrap" }}><button type="button" style={btn} disabled={busy === v.videoId} onClick={() => createStory(v.videoId)}>Create story</button></td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={8} style={{ padding: 16, color: "#6b7280" }}>Nothing in this window yet. The poller runs every 15 minutes.</td></tr>}
          </tbody>
        </table>
      )}

      {data && view === "clusters" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {data.clusters.map((c) => (
            <div key={c.topicKey} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong style={{ fontSize: 14 }}>{c.topicKey.replace(/\+/g, " · ")}</strong>
                <span style={{ ...chip, background: c.channels >= 3 ? "#fee2e2" : "#f3f4f6" }}>{c.channels} channel{c.channels === 1 ? "" : "s"}</span>
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{fmt(c.views)} views · {c.towns.join(", ") || "no town detected"}</div>
              <ul style={{ margin: "8px 0 0 16px", padding: 0, fontSize: 13 }}>{c.titles.map((t) => <li key={t}>{t}</li>)}</ul>
              {c.patterns.length > 0 && <div style={{ marginTop: 8 }}><span style={{ fontSize: 12, color: "#6b7280" }}>Patterns: </span>{c.patterns.slice(0, 4).map((p) => <span key={p} style={chip}>{p}</span>)}</div>}
              <button type="button" style={{ ...btn, marginTop: 10 }} disabled={busy === c.videoIds[0]} onClick={() => createStory(c.videoIds[0])}>Create story</button>
            </div>
          ))}
          {data.clusters.length === 0 && <div style={{ color: "#6b7280" }}>No multi-channel stories in this window.</div>}
        </div>
      )}
    </div>
  );
}
