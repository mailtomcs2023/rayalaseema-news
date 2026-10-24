"use client";
// The five Video IQ tabs (spec 4.6), shared by the YouTube workspace page.
// Pure presentation over a run row + the editor's current choice.
import { useState } from "react";
import { explainDescription, explainTags, explainTitle, joinTitle, scoreDescription, scoreTags, scoreTitle, splitTitle, titleLength, TITLE_MAX } from "@rayalaseema/youtube";
import type { Chosen } from "@/lib/video-iq/chosen";
import { ScorePill } from "./score-pill";
import { canPublish, mmss, quotaEstimate } from "./panel-logic";

/** Per-field AI rewrite (POST /api/video-iq/[id]/regenerate); returns scored candidates. */
export type Regenerate = (field: string, current: unknown, instruction?: string) => Promise<{ candidates: Array<{ value: any; score: number | null; reasons: string[]; why?: string }> }>;

function Reasons({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return <span style={{ fontSize: 12, color: "#166534" }}>✓ passes every check</span>;
  return <span style={{ fontSize: 12, color: "#92400e" }}>{reasons.map((r) => `• ${r}`).join("  ")}</span>;
}

/** "✨ Regenerate" with an optional instruction, shared by every field. */
function AiBar({ label, onRun, busy, placeholder = "Tell the AI what to change (optional)" }: { label: string; onRun: (instruction: string) => Promise<void>; busy: boolean; placeholder?: string }) {
  const [instruction, setInstruction] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
      <input style={{ ...ui.input, flex: 1, minWidth: 220 }} placeholder={placeholder} value={instruction} onChange={(e) => setInstruction(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onRun(instruction); } }} />
      <button type="button" style={ui.btn(false, busy)} disabled={busy} onClick={() => void onRun(instruction)}>{busy ? "Thinking…" : `✨ ${label}`}</button>
    </div>
  );
}

export const ui = {
  btn: (primary = false, disabled = false): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 6, border: "1px solid " + (primary ? "#b91c1c" : "#d1d5db"), background: primary ? "#dc2626" : "#fff",
    color: primary ? "#fff" : "#111827", fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
  }),
  input: { width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 } as React.CSSProperties,
  chip: { display: "inline-block", padding: "2px 8px", borderRadius: 999, background: "#f3f4f6", fontSize: 12, margin: 2 } as React.CSSProperties,
  muted: { color: "#6b7280", fontSize: 12 } as React.CSSProperties,
};
const { btn, input, chip, muted } = ui;

export type Edit = (p: Partial<Chosen>) => void;

export function TitleTab({ s, chosen, edit, regenerate }: { s: any; chosen: Chosen; edit: Edit; regenerate?: Regenerate }) {
  const volumes = new Map<string, number | null>((s?.keywords?.terms ?? []).map((k: any) => [k.term, k.volume]));
  const ctx = { entities: s.entities, breaking: Boolean(s.breaking), volumes };
  const [ai, setAi] = useState<Array<{ value: string; score: number | null; reasons: string[]; why?: string }>>([]);
  const [busy, setBusy] = useState(false);
  async function rewrite(instruction: string) {
    if (!regenerate) return;
    setBusy(true);
    try { const r = await regenerate("title", chosen.title, instruction || undefined); setAi((prev) => [...r.candidates.map((c) => ({ ...c, value: String(c.value) })), ...prev].slice(0, 9)); } catch { /* error shown by the hook */ } finally { setBusy(false); }
  }
  return (
    <div>
      {ai.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={muted}>AI rewrites (newest first)</div>
          {ai.map((t, i) => {
            const selected = chosen.title === t.value;
            return (
              <label key={`ai-${i}`} style={{ display: "block", border: "1px solid " + (selected ? "#dc2626" : "#c7d2fe"), borderRadius: 8, padding: 10, marginBottom: 8, cursor: "pointer", background: selected ? "#fef2f2" : "#eef2ff" }}>
                <input type="radio" name="viq-title" checked={selected} onChange={() => edit({ title: t.value })} style={{ marginRight: 8 }} />
                <span style={{ fontSize: 15 }}>{t.value}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                  <ScorePill label="score" value={t.score} />
                  <span style={muted}>{titleLength(t.value)}/{TITLE_MAX}</span>
                  <Reasons reasons={t.reasons} />
                  {t.why && <span style={muted}>{t.why}</span>}
                </div>
              </label>
            );
          })}
        </div>
      )}
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
          <ScorePill label="score" value={scoreTitle(chosen.title, ctx)} />
          <span style={{ ...muted, color: titleLength(chosen.title) > TITLE_MAX ? "#991b1b" : undefined }}>{titleLength(chosen.title)}/{TITLE_MAX}</span>
          <Reasons reasons={explainTitle(chosen.title, ctx)} />
        </div>
        {regenerate && <AiBar label="Regenerate titles" busy={busy} onRun={rewrite} placeholder="e.g. mention Varadarajulu Reddy, shorter hook, no question" />}
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

export function ThumbnailTab({ row, chosen, edit, push }: { row: any; chosen: Chosen; edit: Edit; push: (t: any, m: string) => void }) {
  const thumbs: any[] = row.thumbnails ?? [];
  const isShort = row.suggestions?.format === "SHORT";
  async function upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    if (row.contentId) fd.append("contentId", row.contentId);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return push("error", j.error || "upload failed");
    edit({ thumbnailIndex: null, thumbnailUrl: j.url });
    push("success", "Custom thumbnail set");
  }
  return (
    <div>
      {isShort && <div style={{ ...muted, marginBottom: 8 }}>Shorts use the video itself as the cover; no thumbnail is uploaded.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
        {thumbs.map((t, i) => {
          const url = t.renderedUrl ?? t.frameUrl;
          const selected = chosen.thumbnailIndex === i;
          return (
            <div key={i} onClick={() => edit({ thumbnailIndex: i, thumbnailUrl: t.renderedUrl ?? t.frameUrl })} style={{ border: "2px solid " + (selected ? "#dc2626" : "#e5e7eb"), borderRadius: 8, overflow: "hidden", cursor: "pointer" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" style={{ width: "100%", display: "block", aspectRatio: "16/9", objectFit: "cover" }} />
              <div style={{ ...muted, padding: 6 }}>{t.renderedUrl ? "branded" : "raw frame"} · {mmss(row.frames?.[i]?.t ?? 0)}{t.error ? ` · render failed: ${t.error}` : ""}</div>
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

export function SeoTab({ s, chosen, edit, regenerate }: { s: any; chosen: Chosen; edit: Edit; regenerate?: Regenerate }) {
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [undo, setUndo] = useState<Partial<Chosen> | null>(null);
  async function rewrite(field: "description" | "tags" | "comment" | "chapters" | "hashtags", instruction: string) {
    if (!regenerate) return;
    setBusy(field);
    try {
      const current = field === "description" ? chosen.description : field === "tags" ? chosen.tags : field === "comment" ? chosen.comment : field === "chapters" ? chosen.chapters : chosen.hashtags;
      const r = await regenerate(field, current, instruction || undefined);
      const c = r.candidates[0];
      if (!c) return;
      setUndo({ [field]: current } as Partial<Chosen>);
      edit({ [field]: c.value } as Partial<Chosen>);
    } catch { /* error shown by the hook */ } finally { setBusy(null); }
  }
  const undoBar = undo ? <button type="button" style={{ ...btn(), marginTop: 6 }} onClick={() => { edit(undo); setUndo(null); }}>↶ Undo last AI change</button> : null;
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
        <div style={muted}>Description (hook first; place line and footer are added at publish)</div>
        <textarea style={{ ...input, minHeight: 140, fontFamily: "inherit" }} value={chosen.description} onChange={(e) => edit({ description: e.target.value })} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
          <ScorePill label="score" value={scoreDescription(chosen.description)} />
          <span style={muted}>{chosen.description.length} chars</span>
          <Reasons reasons={explainDescription(chosen.description)} />
        </div>
        {regenerate && <AiBar label="Rewrite description" busy={busy === "description"} onRun={(i) => rewrite("description", i)} placeholder="e.g. lead with the attack, name the candidate, 4 sentences" />}
        {undoBar}
      </div>
      <div>
        <div style={muted}>Tags ({chosen.tags.length}/30, {chosen.tags.join(",").length}/450 chars)</div>
        <div>{chosen.tags.map((t) => <span key={t} style={chip}>{t} <button type="button" onClick={() => edit({ tags: chosen.tags.filter((x) => x !== t) })} style={{ border: "none", background: "none", cursor: "pointer", color: "#6b7280" }}>×</button></span>)}</div>
        <input style={{ ...input, marginTop: 4 }} placeholder="add tag, press Enter" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); setTagInput(""); } }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
          <ScorePill label="score" value={scoreTags(chosen.tags)} />
          <Reasons reasons={explainTags(chosen.tags)} />
        </div>
        {regenerate && <AiBar label="Suggest more tags" busy={busy === "tags"} onRun={(i) => rewrite("tags", i)} placeholder="e.g. add municipal election terms in Telugu" />}
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
          {regenerate && <AiBar label="Regenerate chapters" busy={busy === "chapters"} onRun={(i) => rewrite("chapters", i)} placeholder="e.g. 5 chapters, shorter titles" />}
        </div>
      )}
      {s.format === "SHORT" && (
        <div>
          <div style={muted}>Hashtags (3 to 5)</div>
          <input style={input} value={chosen.hashtags.join(" ")} onChange={(e) => edit({ hashtags: e.target.value.split(/\s+/).filter(Boolean).slice(0, 5) })} />
          {regenerate && <AiBar label="Suggest hashtags" busy={busy === "hashtags"} onRun={(i) => rewrite("hashtags", i)} />}
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
        <div style={muted}>Pinned comment (no links; pin it in Studio after publish; skipped on private uploads)</div>
        <textarea style={{ ...input, minHeight: 60, fontFamily: "inherit" }} value={chosen.comment} onChange={(e) => edit({ comment: e.target.value })} />
        {regenerate && <AiBar label="Rewrite comment" busy={busy === "comment"} onRun={(i) => rewrite("comment", i)} placeholder="e.g. ask who is responsible, add subscribe line" />}
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

export function ReviewTab({ row, role, note, setNote, override, showTranscript = true }: { row: any; role: string; note: string; setNote: (s: string) => void; override: () => void; showTranscript?: boolean }) {
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
      {showTranscript && (
        <div>
          <div style={muted}>Transcript ({t?.words ?? 0} words, {t?.locale ?? "–"})</div>
          <div style={{ maxHeight: 320, overflow: "auto", fontSize: 13, lineHeight: 1.7, border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
            {(t?.segments ?? []).map((seg: any, i: number) => <div key={i}><span style={{ ...muted, fontVariantNumeric: "tabular-nums" }}>{mmss(seg.start)}</span> {seg.text}</div>)}
            {!t?.segments?.length && <span style={muted}>No transcript (captions not ready or no speech).</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export type Visibility = { visibility: "public" | "private" | "scheduled"; publishAt: string };

export function PublishTab({ row, chosen, role, visibility, setVisibility, dirty }: { row: any; chosen: Chosen; role: string; visibility: Visibility; setVisibility: (v: Visibility) => void; dirty: boolean }) {
  const gate = canPublish(row, role, dirty);
  const applied = row.applied;
  const locked = ["APPLIED", "PUBLISHING"].includes(row.status);
  return (
    <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
      <div><b>Title</b><div>{chosen.title}</div></div>
      <div><b>Thumbnail</b><div style={muted}>{row.suggestions?.format === "SHORT" ? "none (Short)" : chosen.thumbnailUrl ?? "none chosen"}</div></div>
      <div>
        <b>Visibility</b>
        <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
          {(["public", "private", "scheduled"] as const).map((v) => (
            <label key={v} style={{ cursor: locked ? "default" : "pointer" }}>
              <input type="radio" name="viq-visibility" disabled={locked} checked={visibility.visibility === v} onChange={() => setVisibility({ ...visibility, visibility: v })} style={{ marginRight: 4 }} />
              {v === "public" ? "Public now" : v === "private" ? "Private" : "Schedule at"}
            </label>
          ))}
          {visibility.visibility === "scheduled" && (
            <input type="datetime-local" disabled={locked} value={visibility.publishAt} onChange={(e) => setVisibility({ ...visibility, publishAt: e.target.value })} style={{ ...input, width: 220 }} />
          )}
          {visibility.visibility === "scheduled" && <span style={muted}>IST, at least 5 minutes ahead; the video stays private until then</span>}
        </div>
      </div>
      <div><b>Description preview</b><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", background: "#f9fafb", padding: 8, borderRadius: 6 }}>{chosen.description}</pre><div style={muted}>Place line and footer are appended automatically; the website link is added once the article is published.</div></div>
      <div><b>Tags</b> {chosen.tags.length} · <b>Playlists</b> {chosen.playlists.join(", ") || "none"} · <b>Comment</b> {chosen.comment ? "yes" : "no"} · <b>Chapters</b> {chosen.chapters.length}</div>
      <div><b>Quota</b> about {quotaEstimate(row)} units of the 10,000 daily budget ({row.source === "BLOB" ? "new upload" : "update of an existing video"})</div>
      <div><b>Fixed settings</b> category News &amp; Politics · language Telugu · not made for kids · embeddable</div>
      {!gate.ok && row.status !== "APPLIED" && <div style={{ color: "#92400e" }}>Publish blocked: {gate.reason}</div>}
      {row.status === "APPLIED" && row.videoId && (
        <div style={{ background: "#dcfce7", padding: 10, borderRadius: 8 }}>
          Published: <a href={`https://www.youtube.com/watch?v=${row.videoId}`} target="_blank" rel="noreferrer">youtube.com/watch?v={row.videoId}</a>
          {applied?.at && <div style={muted}>at {new Date(applied.at).toLocaleString()}</div>}
          {applied?.articleLink && <div style={muted}>website link added: {applied.articleLink}</div>}
          {applied?.warnings?.length > 0 && <ul style={{ margin: "6px 0 0 16px", color: "#92400e" }}>{applied.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
