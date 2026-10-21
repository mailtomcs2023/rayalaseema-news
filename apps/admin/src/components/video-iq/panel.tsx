"use client";
// Video IQ panel (spec 4.6): Title / Thumbnail / SEO / Review / Publish tabs
// under the VIDEO and REEL editors. Suggestions come from the worker; the
// editor picks, saves, approves, and (editor/admin) publishes.
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { joinTitle, scoreTitle, splitTitle, titleLength, TITLE_MAX } from "@rayalaseema/youtube";
import type { Chosen } from "@/lib/video-iq/chosen";
import { confirm } from "@/components/confirm-dialog";
import { ToastViewport, useToasts } from "@/components/toast";
import { ScorePill } from "./score-pill";
import { useOptimization } from "./use-optimization";
import { canApprove, canPublish, defaultChosen, mmss, quotaEstimate } from "./panel-logic";

type Tab = "title" | "thumbnail" | "seo" | "review" | "publish";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "title", label: "Title" }, { id: "thumbnail", label: "Thumbnail" }, { id: "seo", label: "SEO" }, { id: "review", label: "Review" }, { id: "publish", label: "Publish" },
];

const box: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginTop: 16, background: "#fff" };
const btn = (primary = false, disabled = false): React.CSSProperties => ({
  padding: "6px 14px", borderRadius: 6, border: "1px solid " + (primary ? "#b91c1c" : "#d1d5db"), background: primary ? "#dc2626" : "#fff",
  color: primary ? "#fff" : "#111827", fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
});
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 };
const chip: React.CSSProperties = { display: "inline-block", padding: "2px 8px", borderRadius: 999, background: "#f3f4f6", fontSize: 12, margin: 2 };
const muted: React.CSSProperties = { color: "#6b7280", fontSize: 12 };

const STATUS_TONE: Record<string, string> = { QUEUED: "#e5e7eb", EXTRACTING: "#dbeafe", TRANSCRIBING: "#dbeafe", ANALYZING: "#dbeafe", READY: "#dcfce7", APPROVED: "#dcfce7", PUBLISHING: "#fef3c7", APPLIED: "#dcfce7", FAILED: "#fee2e2" };

export function VideoIqPanel({ contentId }: { contentId?: string }) {
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role ?? "");
  const opt = useOptimization(contentId);
  const { toasts, push, dismiss } = useToasts();
  const [tab, setTab] = useState<Tab>("title");
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState("");

  const row = opt.row;
  const s = row?.suggestions;
  const ready = row && ["READY", "APPROVED", "APPLIED"].includes(row.status) && s?.titles;
  const inFlight = Boolean(row && ["QUEUED", "EXTRACTING", "TRANSCRIBING", "ANALYZING", "PUBLISHING"].includes(row.status));

  useEffect(() => {
    if (ready && !dirty) setChosen(defaultChosen(row));
  }, [row?.id, row?.status, ready, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const volumes = useMemo(() => new Map<string, number | null>((s?.keywords?.terms ?? []).map((k: any) => [k.term, k.volume])), [s]);
  const edit = (patch: Partial<Chosen>) => { setChosen((c) => (c ? { ...c, ...patch } : c)); setDirty(true); };

  async function save() {
    if (!chosen) return;
    const { override, ...rest } = chosen as Chosen & { override?: unknown };
    void override;
    try { await opt.save(rest); setDirty(false); push("success", "Choice saved"); } catch (e) { push("error", (e as Error).message); }
  }
  async function approve() {
    if (dirty) await save();
    try { await opt.approve(); push("success", "Approved for YouTube"); } catch (e) { push("error", (e as Error).message); }
  }
  async function publish() {
    const units = quotaEstimate(row);
    // The server publishes the SAVED choice, so the dialog quotes row.chosen.
    const ok = await confirm({ title: "Publish to YouTube?", description: `This writes "${row?.chosen?.title}" to the channel and spends about ${units} quota units.`, confirmText: "Publish", destructive: true });
    if (!ok) return;
    try {
      const r = await opt.publish();
      push(r?.warnings?.length ? "warn" : "success", r?.dryRun ? `Dry run: ${r.videoId}` : `Published: ${r.url}`);
      setTab("publish");
    } catch (e) { push("error", (e as Error).message); }
  }
  async function override() {
    try { await opt.override(note); setNote(""); push("success", "Override recorded"); } catch (e) { push("error", (e as Error).message); }
  }

  if (!contentId) return <div style={box}><strong>Video IQ</strong><div style={muted}>Save the item first, then run Video IQ.</div></div>;
  if (!opt.loaded) return <div style={box}><strong>Video IQ</strong><div style={muted}>Loading…</div></div>;

  return (
    <div style={box}>
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 15 }}>Video IQ</strong>
        {row && <span style={{ ...chip, background: STATUS_TONE[row.status] ?? "#e5e7eb", fontWeight: 600 }}>{row.status}</span>}
        {row?.scores && <ScorePill label="overall" value={row.scores.overall} />}
        {s?.format && <span style={chip}>{s.format}</span>}
        {s?.low_confidence && <span style={{ ...chip, background: "#fef3c7" }}>low confidence</span>}
        <span style={{ flex: 1 }} />
        <button type="button" data-testid="viq-optimize" style={btn(false, opt.busy || inFlight)} disabled={opt.busy || inFlight} title={inFlight ? "a run is in progress; wait for READY" : undefined} onClick={() => opt.optimize().then(() => push("info", "Queued; analysis usually takes 1 to 3 minutes")).catch((e) => push("error", e.message))}>
          {row ? "Re-run" : "Optimize"}
        </button>
        {ready && <button type="button" data-testid="viq-save" style={btn(false, opt.busy || !dirty)} disabled={opt.busy || !dirty} onClick={save}>Save</button>}
        {ready && <button type="button" data-testid="viq-approve" style={btn(false, opt.busy || !canApprove({ ...row, chosen: chosen ?? row.chosen }, role).ok)} disabled={opt.busy || !canApprove({ ...row, chosen: chosen ?? row.chosen }, role).ok} onClick={approve} title={canApprove({ ...row, chosen: chosen ?? row.chosen }, role).reason}>Approve</button>}
        {ready && <button type="button" data-testid="viq-publish" style={btn(true, opt.busy || !canPublish(row, role, dirty).ok)} disabled={opt.busy || !canPublish(row, role, dirty).ok} onClick={publish} title={canPublish(row, role, dirty).reason}>Publish</button>}
      </div>
      {opt.err && <div style={{ color: "#991b1b", fontSize: 13, marginTop: 8 }}>{opt.err}</div>}
      {row?.error && row.status !== "APPLIED" && <div style={{ color: "#92400e", fontSize: 13, marginTop: 8 }}>{row.error}</div>}
      {!row && <div style={{ ...muted, marginTop: 8 }}>Not optimised yet. Optimize extracts the audio, transcribes it (Telugu), proposes titles, SEO and thumbnails, and checks channel fit.</div>}
      {row && !ready && row.status !== "FAILED" && <div style={{ ...muted, marginTop: 8 }}>Working: {row.status.toLowerCase()}… this panel refreshes every 10 seconds.</div>}

      {ready && chosen && (
        <>
          <div style={{ display: "flex", gap: 4, marginTop: 14, borderBottom: "1px solid #e5e7eb" }}>
            {TABS.map((t) => (
              <button key={t.id} type="button" data-testid={`viq-tab-${t.id}`} onClick={() => setTab(t.id)} style={{ padding: "8px 12px", border: "none", background: "none", fontWeight: 600, fontSize: 13, color: tab === t.id ? "#dc2626" : "#374151", borderBottom: tab === t.id ? "2px solid #dc2626" : "2px solid transparent", cursor: "pointer" }}>{t.label}</button>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            {tab === "title" && <TitleTab s={s} chosen={chosen} edit={edit} volumes={volumes} />}
            {tab === "thumbnail" && <ThumbnailTab row={row} chosen={chosen} edit={edit} contentId={contentId} push={push} />}
            {tab === "seo" && <SeoTab s={s} chosen={chosen} edit={edit} />}
            {tab === "review" && <ReviewTab row={row} role={role} note={note} setNote={setNote} override={override} />}
            {tab === "publish" && <PublishTab row={row} chosen={chosen} role={role} />}
          </div>
        </>
      )}
    </div>
  );
}

function TitleTab({ s, chosen, edit, volumes }: { s: any; chosen: Chosen; edit: (p: Partial<Chosen>) => void; volumes: Map<string, number | null> }) {
  const ctx = { entities: s.entities, breaking: Boolean(s.breaking), volumes };
  return (
    <div>
      {s.titles.map((t: any, i: number) => {
        const selected = chosen.title === t.text;
        return (
          <label key={i} style={{ display: "block", border: "1px solid " + (selected ? "#dc2626" : "#e5e7eb"), borderRadius: 8, padding: 10, marginBottom: 8, cursor: "pointer", background: selected ? "#fef2f2" : "#fff" }}>
            <input type="radio" name="viq-title" checked={selected} onChange={() => edit({ title: t.text })} style={{ marginRight: 8 }} />
            <span style={{ fontSize: 15 }}>{t.text}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <ScorePill label="score" value={scoreTitle(t.text, ctx)} />
              <span style={muted}>{titleLength(t.text)}/{TITLE_MAX}</span>
              {t.why && <span style={muted}>{t.why}</span>}
            </div>
          </label>
        );
      })}
      <div style={{ marginTop: 10 }}>
        <div style={muted}>Edit the chosen title (Telugu hook | English headline)</div>
        <input style={input} value={chosen.title} onChange={(e) => edit({ title: e.target.value })} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          <ScorePill label="score" value={scoreTitle(chosen.title, ctx)} />
          <span style={{ ...muted, color: titleLength(chosen.title) > TITLE_MAX ? "#991b1b" : undefined }}>{titleLength(chosen.title)}/{TITLE_MAX}</span>
          {!splitTitle(chosen.title).english && <span style={{ ...muted, color: "#991b1b" }}>needs an English headline after " | "</span>}
        </div>
      </div>
      {s.keywords?.terms?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={muted}>Search demand (India, monthly)</div>
          {s.keywords.terms.map((k: any) => <span key={k.term} style={chip}>{k.term}: {k.volume ?? "–"}</span>)}
        </div>
      )}
    </div>
  );
}

function ThumbnailTab({ row, chosen, edit, contentId, push }: { row: any; chosen: Chosen; edit: (p: Partial<Chosen>) => void; contentId: string; push: (t: any, m: string) => void }) {
  const thumbs: any[] = row.thumbnails ?? [];
  const isShort = row.suggestions?.format === "SHORT";
  async function upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("contentId", contentId);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return push("error", j.error || "upload failed");
    edit({ thumbnailIndex: null, thumbnailUrl: j.url });
    push("success", "Custom thumbnail set");
  }
  return (
    <div>
      {isShort && <div style={{ ...muted, marginBottom: 8 }}>Shorts use the video itself as the cover; no thumbnail is uploaded.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {thumbs.map((t, i) => {
          const url = t.renderedUrl ?? t.frameUrl;
          const selected = chosen.thumbnailIndex === i;
          return (
            <div key={i} onClick={() => edit({ thumbnailIndex: i, thumbnailUrl: t.renderedUrl ?? t.frameUrl })} style={{ border: "2px solid " + (selected ? "#dc2626" : "#e5e7eb"), borderRadius: 8, overflow: "hidden", cursor: "pointer" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" style={{ width: "100%", display: "block", aspectRatio: "16/9", objectFit: "cover" }} />
              <div style={{ ...muted, padding: 6 }}>{t.renderedUrl ? "branded" : "raw frame"} · {mmss(row.frames?.[i]?.t ?? 0)}</div>
            </div>
          );
        })}
        {chosen.thumbnailIndex === null && chosen.thumbnailUrl && (
          <div style={{ border: "2px solid #dc2626", borderRadius: 8, overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={chosen.thumbnailUrl} alt="" style={{ width: "100%", display: "block", aspectRatio: "16/9", objectFit: "cover" }} />
            <div style={{ ...muted, padding: 6 }}>custom upload</div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={muted}>Headline on the branded frames: {row.suggestions?.thumbnail?.headline_te}</div>
        <label style={{ ...btn(false), display: "inline-block", marginTop: 6 }}>
          Upload custom 1280×720 JPEG
          <input type="file" accept="image/jpeg,image/png" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.currentTarget.value = ""; }} />
        </label>
      </div>
    </div>
  );
}

function SeoTab({ s, chosen, edit }: { s: any; chosen: Chosen; edit: (p: Partial<Chosen>) => void }) {
  const [tagInput, setTagInput] = useState("");
  const addTag = (t: string) => { const v = t.trim(); if (v && !chosen.tags.includes(v) && chosen.tags.length < 30) edit({ tags: [...chosen.tags, v] }); };
  const useInTitle = (term: string) => edit({ title: joinTitle(splitTitle(chosen.title).hook, term) });
  const togglePlaylist = (name: string) => {
    const has = chosen.playlists.includes(name);
    if (has) edit({ playlists: chosen.playlists.filter((p) => p !== name) });
    else if (chosen.playlists.length < 3) edit({ playlists: [...chosen.playlists, name] });
  };
  const kw = s.keywords;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <div style={muted}>Description (hook first; link, place line and footer are added at publish)</div>
        <textarea style={{ ...input, minHeight: 140, fontFamily: "inherit" }} value={chosen.description} onChange={(e) => edit({ description: e.target.value })} />
      </div>
      <div>
        <div style={muted}>Tags ({chosen.tags.length}/30, {chosen.tags.join(",").length}/450 chars)</div>
        <div>{chosen.tags.map((t) => <span key={t} style={chip}>{t} <button type="button" onClick={() => edit({ tags: chosen.tags.filter((x) => x !== t) })} style={{ border: "none", background: "none", cursor: "pointer", color: "#6b7280" }}>×</button></span>)}</div>
        <input style={{ ...input, marginTop: 4 }} placeholder="add tag, press Enter" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); setTagInput(""); } }} />
      </div>
      {s.format !== "SHORT" && (
        <div>
          <div style={muted}>Chapters (mm:ss and Telugu title)</div>
          {chosen.chapters.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input style={{ ...input, width: 90 }} value={c.start} onChange={(e) => edit({ chapters: chosen.chapters.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
              <input style={input} value={c.title_te} onChange={(e) => edit({ chapters: chosen.chapters.map((x, j) => (j === i ? { ...x, title_te: e.target.value } : x)) })} />
              <button type="button" style={btn()} onClick={() => edit({ chapters: chosen.chapters.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button type="button" style={{ ...btn(), marginTop: 6 }} onClick={() => edit({ chapters: [...chosen.chapters, { start: chosen.chapters.length ? "" : "00:00", title_te: "" }] })}>+ chapter</button>
        </div>
      )}
      {s.format === "SHORT" && (
        <div>
          <div style={muted}>Hashtags (3 to 5)</div>
          <input style={input} value={chosen.hashtags.join(" ")} onChange={(e) => edit({ hashtags: e.target.value.split(/\s+/).filter(Boolean).slice(0, 5) })} />
        </div>
      )}
      <div>
        <div style={muted}>Playlists (up to 3; ranked by fit)</div>
        {(s.playlists ?? []).map((p: string) => (
          <label key={p} style={{ ...chip, cursor: "pointer", background: chosen.playlists.includes(p) ? "#fee2e2" : "#f3f4f6" }}>
            <input type="checkbox" checked={chosen.playlists.includes(p)} onChange={() => togglePlaylist(p)} style={{ marginRight: 4 }} />{p}
          </label>
        ))}
      </div>
      <div>
        <div style={muted}>Pinned comment (no links; pin it in Studio after publish)</div>
        <textarea style={{ ...input, minHeight: 60, fontFamily: "inherit" }} value={chosen.comment} onChange={(e) => edit({ comment: e.target.value })} />
      </div>
      <div>
        <div style={muted}>Keyword ideas {kw?.unavailable ? `(unavailable: ${kw.unavailable})` : "(DataForSEO, India)"}</div>
        {(kw?.suggested ?? []).map((k: any) => (
          <span key={k.term} style={chip}>
            {k.term} {k.volume != null && <b>{k.volume}</b>}
            <button type="button" onClick={() => addTag(k.term)} style={{ marginLeft: 4, border: "none", background: "none", cursor: "pointer", color: "#2563eb" }}>+tag</button>
            <button type="button" onClick={() => useInTitle(k.term)} style={{ border: "none", background: "none", cursor: "pointer", color: "#2563eb" }}>→title</button>
          </span>
        ))}
      </div>
      {kw?.serp?.length > 0 && (
        <div>
          <div style={muted}>Who ranks today on YouTube for the lead headline</div>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <tbody>
              {kw.serp.slice(0, 10).map((h: any) => (
                <tr key={h.rank + h.url} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: 4, width: 28 }}>{h.rank}</td>
                  <td style={{ padding: 4, whiteSpace: "nowrap" }}>{h.channel}</td>
                  <td style={{ padding: 4 }}><a href={h.url} target="_blank" rel="noreferrer">{h.title}</a></td>
                  <td style={{ padding: 4, textAlign: "right" }}>{h.views ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReviewTab({ row, role, note, setNote, override }: { row: any; role: string; note: string; setNote: (s: string) => void; override: () => void }) {
  const s = row.suggestions;
  const t = row.transcript;
  const fit = s.fit;
  const fitTone = fit.verdict === "fit" ? "#dcfce7" : fit.verdict === "borderline" ? "#fef3c7" : "#fee2e2";
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {s.hook?.late && (
        <div style={{ background: "#fef3c7", color: "#92400e", padding: 10, borderRadius: 8, fontSize: 13 }}>
          Late hook: the news starts at {mmss(s.hook.startsAt)} ({s.hook.reason}). Viewers decide in the first {s.format === "SHORT" ? 2 : 5} seconds; trim the opening before upload if you can.
        </div>
      )}
      <div style={{ background: fitTone, padding: 10, borderRadius: 8, fontSize: 13 }}>
        <b>Channel fit: {fit.verdict}</b> · district {fit.district ?? "unknown"} · local relevance {Math.round(fit.local_relevance * 100)}% · reuse risk {fit.reused_content_risk}
        {fit.reason_te && <div style={{ marginTop: 4 }}>{fit.reason_te}</div>}
        {row.chosen?.override && <div style={{ ...muted, marginTop: 4 }}>Admin override: {row.chosen.override.note}</div>}
        {fit.verdict === "not_fit" && role === "ADMIN" && !row.chosen?.override && (
          <div style={{ marginTop: 8 }}>
            <input style={input} placeholder="Why publish anyway? (recorded in the audit log)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="button" style={{ ...btn(), marginTop: 6 }} disabled={note.trim().length < 5} onClick={override}>Record override</button>
          </div>
        )}
      </div>
      <div>
        <div style={muted}>Summary</div>
        <div style={{ fontSize: 14 }}>{s.summary_te}</div>
        <div style={{ ...muted, marginTop: 2 }}>{s.summary_en}</div>
      </div>
      <div>
        <div style={muted}>Entities</div>
        {[...s.entities.people, ...s.entities.places, ...s.entities.parties, ...s.entities.topics].map((e: string) => <span key={e} style={chip}>{e}</span>)}
      </div>
      {row.scores && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["title", "thumbnail", "description", "tags", "fit", "overall"] as const).map((k) => <ScorePill key={k} label={k} value={row.scores[k]} />)}
        </div>
      )}
      <div>
        <div style={muted}>Transcript ({t?.words ?? 0} words, {t?.locale ?? "–"})</div>
        <div style={{ maxHeight: 280, overflow: "auto", fontSize: 13, lineHeight: 1.7, border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
          {(t?.segments ?? []).map((seg: any, i: number) => <div key={i}><span style={{ ...muted, fontVariantNumeric: "tabular-nums" }}>{mmss(seg.start)}</span> {seg.text}</div>)}
          {!t?.segments?.length && <span style={muted}>No transcript (captions not ready or no speech).</span>}
        </div>
      </div>
    </div>
  );
}

function PublishTab({ row, chosen, role }: { row: any; chosen: Chosen; role: string }) {
  const gate = canPublish(row, role);
  const applied = row.applied;
  return (
    <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
      <div><b>Title</b><div>{chosen.title}</div></div>
      <div><b>Thumbnail</b><div style={muted}>{row.suggestions?.format === "SHORT" ? "none (Short)" : chosen.thumbnailUrl ?? "none chosen"}</div></div>
      <div><b>Description preview</b><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", background: "#f9fafb", padding: 8, borderRadius: 6 }}>{chosen.description}</pre><div style={muted}>Article link, place line and footer are appended automatically.</div></div>
      <div><b>Tags</b> {chosen.tags.length} · <b>Playlists</b> {chosen.playlists.join(", ") || "none"} · <b>Comment</b> {chosen.comment ? "yes" : "no"} · <b>Chapters</b> {chosen.chapters.length}</div>
      <div><b>Quota</b> about {quotaEstimate(row)} units of the 10,000 daily budget ({row.source === "BLOB" ? "new upload" : "update of an existing video"})</div>
      <div><b>Fixed settings</b> category News &amp; Politics · language Telugu · not made for kids · embeddable</div>
      {!gate.ok && <div style={{ color: "#92400e" }}>Publish blocked: {gate.reason}</div>}
      {row.status === "APPLIED" && row.videoId && (
        <div style={{ background: "#dcfce7", padding: 10, borderRadius: 8 }}>
          Published: <a href={`https://www.youtube.com/watch?v=${row.videoId}`} target="_blank" rel="noreferrer">youtube.com/watch?v={row.videoId}</a>
          {applied?.at && <div style={muted}>at {new Date(applied.at).toLocaleString()}</div>}
          {applied?.warnings?.length > 0 && <ul style={{ margin: "6px 0 0 16px", color: "#92400e" }}>{applied.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
