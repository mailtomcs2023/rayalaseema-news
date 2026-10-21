"use client";
// /youtube main screen: our channel's uploads as cards with stats, scores
// and opportunities (spec 2026-10-22 §3.1), plus runs not yet on YouTube.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ToastViewport, useToasts } from "@/components/toast";
import { ScorePill } from "@/components/video-iq/score-pill";
import { ui } from "@/components/video-iq/tabs";

const { btn, chip, muted, input } = ui;
type Item = { videoId: string; title: string; thumbnailUrl: string | null; publishedAt: string; durationSec: number; isShort: boolean; privacy: string; views: number; likes: number; comments: number; viewsPerHour: number; outlier: number; rank: number | null; rankQuery: string | null; rankCheckedAt: string | null; scores: { title: number | null; content: number | null; thumbnail: number | null }; opportunity: boolean; run: { id: string; status: string; overall: number | null } | null };
type RunCard = { id: string; status: string; title: string; deskTitle: string; score: number | null; thumb: string | null; videoId: string | null; warnings: number; createdBy: string; createdAt: string };
type Insights = { from: string; to: string; totals: { views: number; minutesWatched: number; subscribersGained: number; subscribersLost: number }; sources: Array<{ source: string; views: number; share: number }>; channel: { subscribers: number; videos: number; views: number } | null };

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
const ago = (iso: string) => { const h = (Date.now() - new Date(iso).getTime()) / 36e5; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`; };
const STATUS_TONE: Record<string, string> = { QUEUED: "#e5e7eb", EXTRACTING: "#dbeafe", TRANSCRIBING: "#dbeafe", ANALYZING: "#dbeafe", READY: "#dcfce7", APPROVED: "#dcfce7", PUBLISHING: "#fef3c7", APPLIED: "#dcfce7", FAILED: "#fee2e2" };

export function Catalog() {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [tab, setTab] = useState<"videos" | "shorts" | "insights">("videos");
  const [privacy, setPrivacy] = useState("all");
  const [sort, setSort] = useState("newest");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ items: Item[]; total: number; lastSync: string | null } | null>(null);
  const [runs, setRuns] = useState<RunCard[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ tab: tab === "shorts" ? "shorts" : "videos", privacy, sort, ...(q ? { q } : {}) });
    const [c, r] = await Promise.all([fetch(`/api/youtube/catalog?${p}`), fetch("/api/youtube/runs?status=active")]);
    if (c.ok) setData(await c.json());
    if (r.ok) setRuns(((await r.json()).items ?? []).filter((x: RunCard) => x.status !== "APPLIED"));
  }, [tab, privacy, sort, q]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === "insights" && !insights) fetch("/api/youtube/insights").then((r) => (r.ok ? r.json() : null)).then(setInsights).catch(() => {}); }, [tab, insights]);
  useEffect(() => { const t = setInterval(() => { if (runs.length) void load(); }, 10_000); return () => clearInterval(t); }, [runs.length, load]);

  async function scoreVideo(videoId: string) {
    setBusy(videoId);
    try {
      const r = await fetch("/api/youtube/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "youtube", videoUrl: videoId, deskTitle: "" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      router.push(`/youtube/${j.id}`);
    } catch (e) { push("error", (e as Error).message); setBusy(null); }
  }
  async function checkRank(videoId: string) {
    setBusy(videoId + ":rank");
    try {
      const r = await fetch(`/api/youtube/catalog/${videoId}/rank`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      push("info", j.rank ? `Rank ${j.rank} for "${j.query}"` : `Not in the top 20 for "${j.query}"`);
      await load();
    } catch (e) { push("error", (e as Error).message); } finally { setBusy(null); }
  }

  return (
    <div>
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <input style={{ ...input, maxWidth: 360 }} placeholder="Search videos…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span style={{ flex: 1 }} />
        <Link href="/trending" style={btn()}>Trending desk</Link>
        <Link href="/youtube/new" style={btn(true)} data-testid="yt-upload">⬆ Upload</Link>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        {(["videos", "shorts", "insights"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{ ...btn(false), background: tab === t ? "#fee2e2" : "#fff" }}>{t === "videos" ? "Videos" : t === "shorts" ? "Shorts" : "Channel insights"}</button>
        ))}
        {tab !== "insights" && (
          <>
            <span style={{ width: 12 }} />
            {["all", "public", "private", "unlisted"].map((p) => (
              <button key={p} type="button" onClick={() => setPrivacy(p)} style={{ ...btn(false), background: privacy === p ? "#f3f4f6" : "#fff", fontWeight: privacy === p ? 700 : 500 }}>{p === "all" ? "All" : p === "public" ? "Public" : p === "private" ? "Drafts" : "Unlisted"}</button>
            ))}
            <select style={{ ...input, width: 220, marginLeft: "auto" }} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="views">Most views</option>
              <option value="fastest">Fastest (views/hour)</option>
              <option value="opportunities">Opportunities (lowest score first)</option>
            </select>
          </>
        )}
      </div>

      {tab === "insights" ? (
        <InsightsPanel data={insights} />
      ) : (
        <>
          {runs.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...muted, marginBottom: 6 }}>In progress / waiting for publish</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                {runs.map((r) => (
                  <Link key={r.id} href={`/youtube/${r.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ aspectRatio: "16/9", background: "#111827" }}>{r.thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={r.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}</div>
                      <div style={{ padding: 10 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span style={{ ...chip, background: STATUS_TONE[r.status] ?? "#e5e7eb", fontWeight: 600 }}>{r.status}</span>{r.score != null && <ScorePill label="overall" value={r.score} />}</div>
                        <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.35 }}>{r.title || r.deskTitle}</div>
                        <div style={{ ...muted, marginTop: 4 }}>{r.createdBy} · {ago(r.createdAt)}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {!data && <div style={muted}>Loading…</div>}
          {data && data.items.length === 0 && <div style={muted}>No videos in the catalog yet. The channel sync runs every 30 minutes.</div>}
          {data && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {data.items.map((v) => (
                <div key={v.videoId} style={{ background: "#fff", border: "1px solid " + (v.opportunity ? "#f59e0b" : "#e5e7eb"), borderRadius: 10, overflow: "hidden" }}>
                  <a href={v.run ? `/youtube/${v.run.id}` : `https://www.youtube.com/watch?v=${v.videoId}`} target={v.run ? undefined : "_blank"} rel="noreferrer" style={{ display: "block", aspectRatio: "16/9", background: "#111827", position: "relative" }}>
                    {v.thumbnailUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={v.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                    {v.privacy !== "public" && <span style={{ ...chip, position: "absolute", top: 6, left: 6, background: "#fef3c7" }}>{v.privacy}</span>}
                    {v.opportunity && <span style={{ ...chip, position: "absolute", top: 6, right: 6, background: "#fef3c7", fontWeight: 600 }}>opportunity</span>}
                  </a>
                  <div style={{ padding: 10 }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                      <ScorePill label="Title" value={v.scores.title} />
                      {v.scores.thumbnail != null && <ScorePill label="Thumbnail" value={v.scores.thumbnail} />}
                      <ScorePill label="Content" value={v.scores.content} />
                      {v.run ? <Link href={`/youtube/${v.run.id}`} style={{ ...chip, textDecoration: "none", color: "#111827" }}>{v.run.status === "APPLIED" ? "optimised" : v.run.status.toLowerCase()}</Link>
                        : <button type="button" style={{ ...chip, cursor: "pointer", border: "1px solid #d1d5db", background: "#fff" }} disabled={busy === v.videoId} onClick={() => scoreVideo(v.videoId)}>+ Score video</button>}
                    </div>
                    <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.35 }}>{v.title}</div>
                    <div style={{ ...muted, marginTop: 4 }}>{fmt(v.views)} views · {ago(v.publishedAt)} · {fmt(v.viewsPerHour)}/h{v.outlier >= 3 ? ` · ×${v.outlier}` : ""}</div>
                    <div style={{ ...muted, marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}>
                      {v.rankCheckedAt ? <span>{v.rank ? `rank ${v.rank}` : "not in top 20"} for "{v.rankQuery}"</span> : <span>rank not checked</span>}
                      <button type="button" style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 12 }} disabled={busy === v.videoId + ":rank"} onClick={() => checkRank(v.videoId)}>Check rank</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {data?.lastSync && <div style={{ ...muted, marginTop: 10 }}>Catalog synced {ago(data.lastSync)} · {data.total} videos</div>}
        </>
      )}
    </div>
  );
}

function InsightsPanel({ data }: { data: Insights | null }) {
  if (!data) return <div style={muted}>Loading channel insights…</div>;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {[
          ["Views (28 d)", fmt(data.totals.views)], ["Watch time (h, 28 d)", fmt(Math.round(data.totals.minutesWatched / 60))],
          ["Subscribers gained", String(data.totals.subscribersGained)], ["Subscribers lost", String(data.totals.subscribersLost)],
          ...(data.channel ? [["Subscribers", fmt(data.channel.subscribers)], ["Videos", String(data.channel.videos)], ["Lifetime views", fmt(data.channel.views)]] : []),
        ].map(([k, v]) => (
          <div key={k} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div style={muted}>{k}</div></div>
        ))}
      </div>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Where views come from ({data.from} to {data.to})</div>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <tbody>{data.sources.map((s) => (
            <tr key={s.source} style={{ borderTop: "1px solid #f3f4f6" }}><td style={{ padding: 6 }}>{s.source}</td><td style={{ padding: 6, textAlign: "right" }}>{fmt(s.views)}</td><td style={{ padding: 6, width: "40%" }}><div style={{ height: 8, background: "#f3f4f6", borderRadius: 4 }}><div style={{ width: `${s.share}%`, height: 8, background: "#dc2626", borderRadius: 4 }} /></div></td><td style={{ padding: 6, textAlign: "right" }}>{s.share}%</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
