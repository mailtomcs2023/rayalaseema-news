"use client";
// /youtube/[id]: one live screen (owner feedback 2026-10-24: "make it like
// vidIQ"). Left: the video, a live activity feed of what the server is doing,
// the transcript as soon as it exists. Right: the scorecard and the result
// sections (titles, thumbnails, SEO, fit, publish), each filling in the
// moment its data arrives, with skeletons before. No stepper.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import type { Chosen } from "@/lib/video-iq/chosen";
import { confirm } from "@/components/confirm-dialog";
import { ToastViewport, useToasts } from "@/components/toast";
import { ScorePill } from "@/components/video-iq/score-pill";
import { useRun } from "@/components/video-iq/use-optimization";
import { canApprove, canPublish, defaultChosen, mmss, quotaEstimate } from "@/components/video-iq/panel-logic";
import { PublishTab, ReviewTab, SeoTab, ThumbnailTab, TitleTab, ui, type Visibility } from "@/components/video-iq/tabs";

const { btn, chip, muted } = ui;
const STATUS_TONE: Record<string, string> = { QUEUED: "#e5e7eb", EXTRACTING: "#dbeafe", TRANSCRIBING: "#dbeafe", ANALYZING: "#dbeafe", READY: "#dcfce7", APPROVED: "#dcfce7", PUBLISHING: "#fef3c7", APPLIED: "#dcfce7", FAILED: "#fee2e2" };
const STATUS_TEXT: Record<string, string> = { QUEUED: "Starting", EXTRACTING: "Reading the video", TRANSCRIBING: "Listening (Telugu transcript)", ANALYZING: "Writing titles, SEO and thumbnails", READY: "Ready to review", APPROVED: "Approved", PUBLISHING: "Publishing to YouTube", APPLIED: "On YouTube", FAILED: "Failed" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 };
const h2: React.CSSProperties = { fontSize: 14, fontWeight: 700, margin: 0, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 };

const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const hhmmss = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function ScoreRing({ value, size = 84 }: { value: number | null | undefined; size?: number }) {
  const v = typeof value === "number" ? Math.max(0, Math.min(100, Math.round(value))) : null;
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const color = v == null ? "#e5e7eb" : v >= 80 ? "#16a34a" : v >= 60 ? "#f59e0b" : "#dc2626";
  return (
    <div style={{ position: "relative", width: size, height: size }} aria-label={`overall score ${v ?? "pending"}`}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#f3f4f6" strokeWidth={8} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={8} fill="none" strokeLinecap="round" strokeDasharray={`${c}`} strokeDashoffset={`${c * (1 - (v ?? 0) / 100)}`} style={{ transition: "stroke-dashoffset .6s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
        <span style={{ fontSize: size / 3.2, fontWeight: 800, color: v == null ? "#9ca3af" : "#111827" }}>{v ?? "–"}</span>
        <span style={{ fontSize: 10, color: "#6b7280" }}>overall</span>
      </div>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number | null | undefined }) {
  const v = typeof value === "number" ? Math.round(value) : null;
  const color = v == null ? "#e5e7eb" : v >= 80 ? "#16a34a" : v >= 60 ? "#f59e0b" : "#dc2626";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "92px 1fr 32px", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ color: "#374151", textTransform: "capitalize" }}>{label}</span>
      <div style={{ height: 8, background: "#f3f4f6", borderRadius: 4 }}><div style={{ width: `${v ?? 0}%`, height: 8, background: color, borderRadius: 4, transition: "width .6s" }} /></div>
      <span style={{ textAlign: "right", fontWeight: 700 }}>{v ?? "–"}</span>
    </div>
  );
}

function Skeleton({ lines = 3, label }: { lines?: number; label: string }) {
  return (
    <div aria-busy="true">
      <style>{`@keyframes viqShimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}`}</style>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ height: 12, borderRadius: 6, marginBottom: 8, width: `${90 - i * 18}%`, background: "linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 37%,#f3f4f6 63%)", backgroundSize: "800px 100%", animation: "viqShimmer 1.4s infinite linear" }} />
      ))}
      <div style={muted}>{label}</div>
    </div>
  );
}

export function RunWorkspace({ runId }: { runId: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role ?? "");
  const run = useRun(runId);
  const { toasts, push, dismiss } = useToasts();
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [visibility, setVisibility] = useState<Visibility>({ visibility: "public", publishAt: "" });
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState("");
  const [feedOpen, setFeedOpen] = useState(true);

  const row = run.row;
  const s = row?.suggestions;
  const ready = Boolean(row && ["READY", "APPROVED", "APPLIED"].includes(row.status) && s?.titles);
  const inFlight = Boolean(row && ["QUEUED", "EXTRACTING", "TRANSCRIBING", "ANALYZING", "PUBLISHING"].includes(row.status));
  const waitingCaptions = Boolean(row && row.source === "YOUTUBE" && row.status === "TRANSCRIBING" && !row.transcript && !s?.skipCaptions);
  const events: Array<{ at: string; text: string }> = row?.events ?? [];

  useEffect(() => {
    if (ready && !dirty) {
      setChosen(defaultChosen(row));
      setVisibility({ visibility: row.visibility ?? "public", publishAt: toLocalInput(row.publishAt) });
    }
  }, [row?.id, row?.status, ready, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) setFeedOpen(false); }, [ready]);

  const edit = (patch: Partial<Chosen>) => { setChosen((c) => (c ? { ...c, ...patch } : c)); setDirty(true); };
  const editVisibility = (v: Visibility) => { setVisibility(v); setDirty(true); };

  async function save() {
    if (!chosen) return;
    const { override, ...rest } = chosen as Chosen & { override?: unknown };
    void override;
    const vis = visibility.visibility === "scheduled"
      ? { visibility: "scheduled", publishAt: visibility.publishAt ? new Date(visibility.publishAt).toISOString() : null }
      : { visibility: visibility.visibility, publishAt: null };
    try { await run.save(rest, vis); setDirty(false); push("success", "Choice saved"); } catch (e) { push("error", (e as Error).message); }
  }
  async function approve() {
    if (dirty) await save();
    try { await run.approve(); push("success", "Approved"); } catch (e) { push("error", (e as Error).message); }
  }
  async function publish() {
    const units = quotaEstimate(row);
    const vis = row.visibility === "scheduled" ? `scheduled for ${new Date(row.publishAt).toLocaleString()}` : row.visibility === "private" ? "as a private video" : "publicly";
    const ok = await confirm({ title: "Publish to YouTube?", description: `This uploads "${row?.chosen?.title}" ${vis} and spends about ${units} quota units.`, confirmText: "Publish", destructive: true });
    if (!ok) return;
    try {
      const r = await run.publish();
      push(r?.warnings?.length ? "warn" : "success", r?.dryRun ? `Dry run: ${r.videoId}` : `Published: ${r.url}`);
    } catch (e) { push("error", (e as Error).message); }
  }
  async function override() {
    try { await run.override(note); setNote(""); push("success", "Override recorded"); } catch (e) { push("error", (e as Error).message); }
  }
  async function createArticle() {
    try { const r = await run.createArticle(); push("success", r?.existing ? "Opening the existing article" : "Article created as DRAFT"); router.push(`/content/${r.contentId}`); } catch (e) { push("error", (e as Error).message); }
  }
  async function articleLink() {
    try { const r = await run.articleLink(); push("success", r?.already ? "Link already on YouTube" : `Website link added: ${r.url}`); } catch (e) { push("error", (e as Error).message); }
  }
  async function skipCaptions() {
    try { await run.skipCaptions(); push("info", "Continuing from the title; results in a minute"); } catch (e) { push("error", (e as Error).message); }
  }
  async function rerun() {
    if (!row) return;
    const ok = await confirm({ title: "Run Video IQ again?", description: "This repeats transcription and analysis (Azure spend). The current suggestions are replaced by a new run.", confirmText: "Re-run" });
    if (!ok) return;
    try {
      const body = row.source === "BLOB"
        ? { source: "blob", blobUrl: row.blobUrl, deskTitle: row.deskTitle, deskNotes: row.deskNotes ?? undefined, breaking: row.breaking, district: row.district ?? undefined, visibility: row.visibility, publishAt: row.publishAt ?? undefined }
        : { source: "youtube", videoUrl: row.videoId, deskTitle: row.deskTitle, breaking: row.breaking, district: row.district ?? undefined };
      const r = await run.rerun(body);
      router.push(`/youtube/${r.id}`);
    } catch (e) { push("error", (e as Error).message); }
  }

  if (!run.loaded) return <div style={muted}>Loading…</div>;
  if (!row) return <div style={muted}>Run not found. <Link href="/youtube">Back to YouTube</Link></div>;

  const transcript = row.transcript;
  const thumbsOrFrames = (row.thumbnails?.length ? row.thumbnails : null) ?? null;

  return (
    <div>
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <Link href="/youtube" style={{ ...chip, textDecoration: "none", color: "#111827" }}>← YouTube</Link>
        <ScoreRing value={row.scores?.overall} size={64} />
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.3 }}>{row.chosen?.title ?? row.deskTitle ?? "Untitled run"}</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
            <span style={{ ...chip, background: STATUS_TONE[row.status] ?? "#e5e7eb", fontWeight: 600 }}>{STATUS_TEXT[row.status] ?? row.status}</span>
            {s?.format && <span style={chip}>{s.format}</span>}
            {row.breaking && <span style={{ ...chip, background: "#fee2e2" }}>breaking</span>}
            {s?.low_confidence && <span style={{ ...chip, background: "#fef3c7" }}>low confidence</span>}
            {inFlight && <span style={{ ...muted }}>● live, refreshing every 5 s</span>}
          </div>
        </div>
        <button type="button" data-testid="viq-optimize" style={btn(false, run.busy || inFlight)} disabled={run.busy || inFlight} onClick={rerun}>Re-run</button>
        {ready && <button type="button" data-testid="viq-save" style={btn(false, run.busy || !dirty)} disabled={run.busy || !dirty} onClick={save}>Save</button>}
        {ready && <button type="button" data-testid="viq-approve" style={btn(false, run.busy || !canApprove({ ...row, chosen: chosen ?? row.chosen }, role).ok)} disabled={run.busy || !canApprove({ ...row, chosen: chosen ?? row.chosen }, role).ok} onClick={approve} title={canApprove({ ...row, chosen: chosen ?? row.chosen }, role).reason}>Approve</button>}
        {ready && <button type="button" data-testid="viq-publish" style={btn(true, run.busy || !canPublish(row, role, dirty).ok)} disabled={run.busy || !canPublish(row, role, dirty).ok} onClick={publish} title={canPublish(row, role, dirty).reason}>Publish</button>}
      </div>
      {run.err && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 8 }}>{run.err}</div>}
      {row.status === "FAILED" && <div style={{ ...card, background: "#fee2e2", borderColor: "#fca5a5", color: "#7f1d1d", marginBottom: 14 }}>This run failed: {row.error}. Fix the cause and press Re-run.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 2fr) minmax(360px, 3fr)", gap: 16, alignItems: "start" }}>
        {/* Left column */}
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ ...card, padding: 0, overflow: "hidden", background: "#000" }}>
            {row.source === "BLOB" && row.blobUrl ? (
              <video src={row.blobUrl} controls playsInline style={{ width: "100%", display: "block", maxHeight: 420, background: "#000" }} />
            ) : row.videoId ? (
              <iframe src={`https://www.youtube.com/embed/${row.videoId}`} title="video" style={{ width: "100%", aspectRatio: "16/9", border: 0, display: "block" }} allowFullScreen />
            ) : null}
          </div>

          <div style={card}>
            <h2 style={h2}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: inFlight ? "#dc2626" : "#16a34a", boxShadow: inFlight ? "0 0 0 4px rgba(220,38,38,.2)" : "none" }} />
              Activity
              <button type="button" onClick={() => setFeedOpen((o) => !o)} style={{ marginLeft: "auto", border: "none", background: "none", color: "#6b7280", cursor: "pointer", fontSize: 12 }}>{feedOpen ? "hide" : `show (${events.length})`}</button>
            </h2>
            {(feedOpen || inFlight) && (
              <div data-testid="viq-feed" style={{ maxHeight: 260, overflow: "auto", fontSize: 13, lineHeight: 1.6 }}>
                {events.length === 0 && <div style={muted}>Starting… the first line appears within a few seconds.</div>}
                {events.map((e, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 8, padding: "3px 0", borderTop: i ? "1px solid #f3f4f6" : "none", color: i === events.length - 1 && inFlight ? "#111827" : "#374151" }}>
                    <span style={{ ...muted, fontVariantNumeric: "tabular-nums" }}>{hhmmss(e.at)}</span>
                    <span>{e.text}</span>
                  </div>
                ))}
                {inFlight && !waitingCaptions && <div style={{ ...muted, marginTop: 6 }}>Working on: {STATUS_TEXT[row.status]?.toLowerCase()}…</div>}
              </div>
            )}
            {waitingCaptions && (
              <div style={{ marginTop: 10, background: "#fef3c7", color: "#92400e", padding: 10, borderRadius: 8, fontSize: 13 }}>
                Waiting for YouTube's Telugu captions on this existing video (checked every 30 minutes, up to 24 hours).
                <div style={{ marginTop: 8 }}><button type="button" style={btn(true, run.busy)} disabled={run.busy} onClick={skipCaptions}>Analyse now from the title</button></div>
              </div>
            )}
          </div>

          <div style={card}>
            <h2 style={h2}>Transcript {transcript && <span style={muted}>· {transcript.words ?? 0} words</span>}</h2>
            {!transcript && <Skeleton lines={5} label={row.source === "YOUTUBE" ? "Comes from the YouTube caption track" : "Azure Speech is listening; usually 10 to 30 seconds"} />}
            {transcript && s?.hook?.late && (
              <div style={{ background: "#fef3c7", color: "#92400e", padding: 8, borderRadius: 8, fontSize: 12, marginBottom: 8 }}>Late hook: the news starts at {mmss(s.hook.startsAt)} ({s.hook.reason}).</div>
            )}
            {transcript && (
              <div style={{ maxHeight: 360, overflow: "auto", fontSize: 13, lineHeight: 1.7 }}>
                {(transcript.segments ?? []).map((seg: any, i: number) => <div key={i}><span style={{ ...muted, fontVariantNumeric: "tabular-nums" }}>{mmss(seg.start)}</span> {seg.text}</div>)}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "grid", gap: 16 }}>
          <div style={card}>
            <h2 style={h2}>Scorecard</h2>
            <div style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 16, alignItems: "center" }}>
              <ScoreRing value={row.scores?.overall} />
              <div style={{ display: "grid", gap: 6 }}>
                {(["title", "thumbnail", "description", "tags", "fit"] as const).map((k) => <Bar key={k} label={k} value={row.scores?.[k]} />)}
              </div>
            </div>
            {!row.scores && <div style={{ ...muted, marginTop: 8 }}>Scores arrive with the thumbnails at the end of the run.</div>}
          </div>

          <div style={card}>
            <h2 style={h2}>Titles {s?.titles && <span style={muted}>· pick one or edit</span>}</h2>
            {ready && chosen ? <TitleTab s={s} chosen={chosen} edit={edit} /> : <Skeleton lines={3} label="Three Telugu | English titles from the transcript" />}
          </div>

          <div style={card}>
            <h2 style={h2}>Thumbnails {row.frames?.length ? <span style={muted}>· {row.frames.length} frames</span> : null}</h2>
            {ready && chosen ? <ThumbnailTab row={row} chosen={chosen} edit={edit} push={push} /> : row.frames?.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {row.frames.map((f: any, i: number) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={f.url} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 6, opacity: 0.7 }} />)}
                <div style={{ ...muted, gridColumn: "1 / -1" }}>{thumbsOrFrames ? "" : "Frames cut; branded thumbnails render after the titles."}</div>
              </div>
            ) : <Skeleton lines={2} label="Frames and branded thumbnails" />}
          </div>

          <div style={card}>
            <h2 style={h2}>SEO</h2>
            {ready && chosen ? <SeoTab s={s} chosen={chosen} edit={edit} /> : <Skeleton lines={4} label="Description, tags, chapters, playlists, keyword demand" />}
          </div>

          <div style={card}>
            <h2 style={h2}>Channel fit &amp; entities</h2>
            {ready ? <ReviewTab row={row} role={role} note={note} setNote={setNote} override={override} showTranscript={false} /> : <Skeleton lines={2} label="Is this a Rayalaseema story? People, places, parties" />}
          </div>

          <div style={card} data-testid="viq-publish-section">
            <h2 style={h2}>Publish</h2>
            {ready && chosen ? <PublishTab row={row} chosen={chosen} role={role} visibility={visibility} setVisibility={editVisibility} dirty={dirty} /> : <Skeleton lines={2} label="Visibility, quota and the final check" />}
            {row.status === "APPLIED" && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13 }}>Website</strong>
                {row.contentId
                  ? <Link href={`/content/${row.contentId}`} style={btn()}>Open website article</Link>
                  : <button type="button" data-testid="viq-create-article" style={btn(true, run.busy)} disabled={run.busy} onClick={createArticle}>Create website article</button>}
                {row.contentId && <button type="button" style={btn(false, run.busy)} disabled={run.busy} onClick={articleLink} title="Adds the published article's link to the YouTube description">Add website link to YouTube</button>}
                <span style={muted}>DRAFT article with the YouTube link, thumbnail and transcript; publish it from Content, then add the link.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
