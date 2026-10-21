"use client";
// /youtube/[id]: progress rail while the run is in flight, then the full
// Video IQ workspace (Title / Thumbnail / SEO / Review / Publish), then the
// post-publish follow-ups (website article, article link).
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import type { Chosen } from "@/lib/video-iq/chosen";
import { confirm } from "@/components/confirm-dialog";
import { ToastViewport, useToasts } from "@/components/toast";
import { ScorePill } from "@/components/video-iq/score-pill";
import { useRun } from "@/components/video-iq/use-optimization";
import { canApprove, canPublish, defaultChosen, quotaEstimate } from "@/components/video-iq/panel-logic";
import { PublishTab, ReviewTab, SeoTab, ThumbnailTab, TitleTab, ui, type Visibility } from "@/components/video-iq/tabs";

type Tab = "title" | "thumbnail" | "seo" | "review" | "publish";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "title", label: "Title" }, { id: "thumbnail", label: "Thumbnail" }, { id: "seo", label: "SEO" }, { id: "review", label: "Review" }, { id: "publish", label: "Publish" },
];
const STAGES = [
  { key: "QUEUED", label: "Upload received" }, { key: "EXTRACTING", label: "Frames + audio" }, { key: "TRANSCRIBING", label: "Telugu transcript" },
  { key: "ANALYZING", label: "Titles, SEO, fit" }, { key: "READY", label: "Thumbnails + scores" },
];
const STATUS_TONE: Record<string, string> = { QUEUED: "#e5e7eb", EXTRACTING: "#dbeafe", TRANSCRIBING: "#dbeafe", ANALYZING: "#dbeafe", READY: "#dcfce7", APPROVED: "#dcfce7", PUBLISHING: "#fef3c7", APPLIED: "#dcfce7", FAILED: "#fee2e2" };
const { btn, chip, muted } = ui;

const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function RunWorkspace({ runId }: { runId: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const role = String((session?.user as any)?.role ?? "");
  const run = useRun(runId);
  const { toasts, push, dismiss } = useToasts();
  const [tab, setTab] = useState<Tab>("title");
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [visibility, setVisibility] = useState<Visibility>({ visibility: "public", publishAt: "" });
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState("");

  const row = run.row;
  const s = row?.suggestions;
  const ready = Boolean(row && ["READY", "APPROVED", "APPLIED"].includes(row.status) && s?.titles);
  const inFlight = Boolean(row && ["QUEUED", "EXTRACTING", "TRANSCRIBING", "ANALYZING", "PUBLISHING"].includes(row.status));

  useEffect(() => {
    if (ready && !dirty) {
      setChosen(defaultChosen(row));
      setVisibility({ visibility: row.visibility ?? "public", publishAt: toLocalInput(row.publishAt) });
    }
  }, [row?.id, row?.status, ready, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (patch: Partial<Chosen>) => { setChosen((c) => (c ? { ...c, ...patch } : c)); setDirty(true); };
  const editVisibility = (v: Visibility) => { setVisibility(v); setDirty(true); };
  const stageIndex = useMemo(() => Math.max(0, STAGES.findIndex((st) => st.key === row?.status)), [row?.status]);

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
      setTab("publish");
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

  return (
    <div>
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Link href="/youtube" style={{ ...chip, textDecoration: "none", color: "#111827" }}>← YouTube</Link>
        <strong style={{ fontSize: 16 }}>{row.deskTitle || row.chosen?.title || "Untitled run"}</strong>
        <span style={{ ...chip, background: STATUS_TONE[row.status] ?? "#e5e7eb", fontWeight: 600 }}>{row.status}</span>
        {row.scores && <ScorePill label="overall" value={row.scores.overall} />}
        {s?.format && <span style={chip}>{s.format}</span>}
        {row.breaking && <span style={{ ...chip, background: "#fee2e2" }}>breaking</span>}
        {s?.low_confidence && <span style={{ ...chip, background: "#fef3c7" }}>low confidence</span>}
        <span style={{ flex: 1 }} />
        <button type="button" data-testid="viq-optimize" style={btn(false, run.busy || inFlight)} disabled={run.busy || inFlight} onClick={rerun}>Re-run</button>
        {ready && <button type="button" data-testid="viq-save" style={btn(false, run.busy || !dirty)} disabled={run.busy || !dirty} onClick={save}>Save</button>}
        {ready && <button type="button" data-testid="viq-approve" style={btn(false, run.busy || !canApprove({ ...row, chosen: chosen ?? row.chosen }, role).ok)} disabled={run.busy || !canApprove({ ...row, chosen: chosen ?? row.chosen }, role).ok} onClick={approve} title={canApprove({ ...row, chosen: chosen ?? row.chosen }, role).reason}>Approve</button>}
        {ready && <button type="button" data-testid="viq-publish" style={btn(true, run.busy || !canPublish(row, role, dirty).ok)} disabled={run.busy || !canPublish(row, role, dirty).ok} onClick={publish} title={canPublish(row, role, dirty).reason}>Publish</button>}
      </div>
      {run.err && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 8 }}>{run.err}</div>}
      {row.error && row.status !== "APPLIED" && <div style={{ color: "#92400e", fontSize: 13, marginBottom: 8 }}>{row.error}</div>}

      {(inFlight || row.status === "FAILED") && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
            {STAGES.map((st, i) => {
              const done = i < stageIndex || row.status === "READY";
              const current = i === stageIndex && row.status !== "READY";
              return (
                <div key={st.key} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: done ? "#16a34a" : current ? "#dc2626" : "#e5e7eb", color: done || current ? "#fff" : "#6b7280" }}>{done ? "✓" : i + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: current ? 700 : 500 }}>{st.label}</span>
                  {i < STAGES.length - 1 && <span style={{ flex: 1, height: 2, background: done ? "#16a34a" : "#e5e7eb", margin: "0 8px" }} />}
                </div>
              );
            })}
          </div>
          <div style={{ ...muted, marginTop: 10 }}>
            {row.status === "FAILED" ? "This run failed; fix the cause and Re-run." : "Working. Usually 1 to 3 minutes; this page refreshes every 5 seconds."}
          </div>
        </div>
      )}

      {ready && chosen && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e5e7eb" }}>
            {TABS.map((t) => (
              <button key={t.id} type="button" data-testid={`viq-tab-${t.id}`} onClick={() => setTab(t.id)} style={{ padding: "8px 12px", border: "none", background: "none", fontWeight: 600, fontSize: 13, color: tab === t.id ? "#dc2626" : "#374151", borderBottom: tab === t.id ? "2px solid #dc2626" : "2px solid transparent", cursor: "pointer" }}>{t.label}</button>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            {tab === "title" && <TitleTab s={s} chosen={chosen} edit={edit} />}
            {tab === "thumbnail" && <ThumbnailTab row={row} chosen={chosen} edit={edit} push={push} />}
            {tab === "seo" && <SeoTab s={s} chosen={chosen} edit={edit} />}
            {tab === "review" && <ReviewTab row={row} role={role} note={note} setNote={setNote} override={override} />}
            {tab === "publish" && <PublishTab row={row} chosen={chosen} role={role} visibility={visibility} setVisibility={editVisibility} dirty={dirty} />}
          </div>
        </div>
      )}

      {row.status === "APPLIED" && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: 14 }}>Website</strong>
          {row.contentId
            ? <Link href={`/content/${row.contentId}`} style={btn()}>Open website article</Link>
            : <button type="button" data-testid="viq-create-article" style={btn(true, run.busy)} disabled={run.busy} onClick={createArticle}>Create website article</button>}
          {row.contentId && <button type="button" style={btn(false, run.busy)} disabled={run.busy} onClick={articleLink} title="Adds the published article's link to the YouTube description">Add website link to YouTube</button>}
          <span style={muted}>Article is created as DRAFT with the YouTube link, thumbnail and transcript; publish it from Content, then add the link to YouTube.</span>
        </div>
      )}
    </div>
  );
}
