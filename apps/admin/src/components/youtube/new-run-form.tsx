"use client";
// /youtube/new: give Video IQ a video and the desk context.
//   "direct"  - the browser uploads the file straight to YouTube (private),
//               any size; our servers never hold it. The run then works on
//               the YouTube id (captions + YouTube frames).
//   "blob"    - small clip (< 95 MB, Cloudflare's request cap) to our media
//               store; Video IQ transcribes it itself.
//   "youtube" - a video already on the channel.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ToastViewport, useToasts } from "@/components/toast";
import { ui } from "@/components/video-iq/tabs";
import {
  uploadToYouTube, xhrTransport, savedSession, saveSession, videoContentType,
  UploadSessionExpiredError, YT_MAX_BYTES,
} from "@/lib/youtube-direct-upload";

const { btn, input, muted } = ui;
const ALLOWED = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_MB = 95;
const gb = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`);

export function NewRunForm() {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [source, setSource] = useState<"direct" | "blob" | "youtube">("direct");
  const [ytId, setYtId] = useState("");
  const [sent, setSent] = useState<{ done: number; total: number } | null>(null);
  const cancelRef = useRef(false);
  const [blobUrl, setBlobUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [deskTitle, setDeskTitle] = useState("");
  const [deskNotes, setDeskNotes] = useState("");
  const [breaking, setBreaking] = useState(false);
  const [district, setDistrict] = useState("");
  const [districts, setDistricts] = useState<Array<{ nameEn: string; name: string }>>([]);
  const [visibility, setVisibility] = useState<"public" | "private" | "scheduled">("public");
  const [publishAt, setPublishAt] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/locations?limit=50").then((r) => (r.ok ? r.json() : [])).then((rows: any[]) => setDistricts((rows ?? []).map((d) => ({ nameEn: d.nameEn, name: d.name })))).catch(() => {});
  }, []);

  async function uploadFile(file: File) {
    if (!ALLOWED.includes(file.type)) return push("error", "Only MP4, WebM or MOV files.");
    if (file.size > MAX_MB * 1024 * 1024) return push("error", `File is ${Math.round(file.size / 1024 / 1024)} MB; max ${MAX_MB} MB.`);
    setProgress(0);
    setFileName(file.name);
    try {
      const sasRes = await fetch("/api/upload/video-sas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: file.type, size: file.size }) });
      const sas = await sasRes.json().catch(() => ({}));
      if (!sasRes.ok || !sas.uploadUrl) throw new Error(sas.error || "Could not start the upload");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sas.uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Upload failed; check the connection"));
        xhr.send(file);
      });
      void fetch("/api/upload/video-sas/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blobUrl: sas.blobUrl, contentId: null, role: "video", sizeBytes: file.size, mimeType: file.type }) }).catch(() => {});
      setBlobUrl(sas.blobUrl);
      setProgress(100);
      if (!deskTitle) setDeskTitle(file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "));
      push("success", "Video uploaded");
    } catch (e) {
      setProgress(null);
      push("error", (e as Error).message);
    }
  }

  // Keep the tab open while bytes are going to YouTube.
  const uploading = sent !== null && !ytId;
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  async function openSession(file: File, contentType: string): Promise<string> {
    const r = await fetch("/api/youtube/upload-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, size: file.size, contentType, title: deskTitle.trim() || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.sessionUrl) throw new Error(j.issues?.join("; ") || j.error || "Could not start the YouTube upload");
    saveSession(file, j.sessionUrl);
    return j.sessionUrl;
  }

  async function uploadDirect(file: File) {
    if (uploading) return push("error", "An upload is already running");
    const contentType = videoContentType(file);
    if (!contentType) return push("error", "That is not a video file.");
    if (file.size > YT_MAX_BYTES) return push("error", `File is ${gb(file.size)}; YouTube accepts up to 256 GB.`);
    cancelRef.current = false;
    setYtId("");
    setFileName(file.name);
    setSent({ done: 0, total: file.size });
    if (!deskTitle) setDeskTitle(file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "));
    let last = 0;
    const run = (sessionUrl: string) => uploadToYouTube({
      sessionUrl, file, contentType, transport: xhrTransport,
      isCancelled: () => cancelRef.current,
      onProgress: (done, total) => { const now = Date.now(); if (now - last > 500 || done === total) { last = now; setSent({ done, total }); } },
    });
    try {
      const resumeUrl = savedSession(file);
      if (resumeUrl) push("success", "Resuming the earlier upload of this file");
      let id: string;
      try {
        id = await run(resumeUrl ?? (await openSession(file, contentType)));
      } catch (e) {
        if (!(e instanceof UploadSessionExpiredError) || !resumeUrl) throw e;
        saveSession(file, null);
        id = await run(await openSession(file, contentType));
      }
      saveSession(file, null);
      setYtId(id);
      push("success", "Uploaded to YouTube (private until you publish)");
    } catch (e) {
      setSent(null);
      push("error", `${(e as Error).message}${cancelRef.current ? "" : ". Choose the same file again to resume."}`);
    }
  }

  async function start() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { source: source === "direct" ? "youtube" : source, deskTitle: deskTitle.trim(), deskNotes: deskNotes.trim() || undefined, breaking, district: district || undefined, visibility };
      if (source === "blob") body.blobUrl = blobUrl;
      else if (source === "direct") body.videoUrl = ytId;
      else body.videoUrl = videoUrl.trim();
      if (visibility === "scheduled") body.publishAt = publishAt ? new Date(publishAt).toISOString() : undefined;
      const r = await fetch("/api/youtube/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.issues?.join("; ") || j.error || r.statusText);
      router.push(`/youtube/${j.id}`);
    } catch (e) {
      push("error", (e as Error).message);
      setBusy(false);
    }
  }

  const hasVideo = source === "direct" ? Boolean(ytId) : source === "blob" ? Boolean(blobUrl) : videoUrl.trim().length > 0;
  const canStart = !busy && deskTitle.trim().length >= 3 && hasVideo && (visibility !== "scheduled" || Boolean(publishAt));
  const pct = sent && sent.total ? Math.floor((sent.done / sent.total) * 1000) / 10 : 0;

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, maxWidth: 820 }}>
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
      <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
        <label style={{ cursor: uploading ? "not-allowed" : "pointer" }}><input type="radio" disabled={uploading} checked={source === "direct"} onChange={() => setSource("direct")} /> Upload to YouTube (any size)</label>
        <label style={{ cursor: uploading ? "not-allowed" : "pointer" }}><input type="radio" disabled={uploading} checked={source === "blob"} onChange={() => setSource("blob")} /> Short clip under 95 MB</label>
        <label style={{ cursor: uploading ? "not-allowed" : "pointer" }}><input type="radio" disabled={uploading} checked={source === "youtube"} onChange={() => setSource("youtube")} /> Existing video on the channel</label>
      </div>

      {source === "direct" ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void uploadDirect(f); }}
          onClick={() => { if (!uploading) fileRef.current?.click(); }}
          style={{ border: "2px dashed #d1d5db", borderRadius: 10, padding: 28, textAlign: "center", cursor: uploading ? "default" : "pointer", background: ytId ? "#f0fdf4" : "#fafafa" }}
          data-testid="yt-direct-drop"
        >
          <input ref={fileRef} type="file" accept="video/*,.mkv,.mts,.m2ts" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadDirect(f); e.currentTarget.value = ""; }} />
          {ytId ? (
            <div><strong>{fileName}</strong><div style={muted}>on YouTube as private · id {ytId} · click to upload a different file</div></div>
          ) : sent ? (
            <div>
              <strong>Uploading {fileName} to YouTube</strong>
              <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, marginTop: 8 }}><div style={{ width: `${pct}%`, height: 8, background: "#dc2626", borderRadius: 4 }} /></div>
              <div style={muted}>{gb(sent.done)} of {gb(sent.total)} · {pct}% · keep this tab open; if it stops, choose the same file again to resume</div>
              <button type="button" style={{ ...btn(false, false), marginTop: 8 }} onClick={(e) => { e.stopPropagation(); cancelRef.current = true; }}>Pause / cancel</button>
            </div>
          ) : (
            <div><strong>Drop the video here, or click to choose</strong><div style={muted}>Goes straight to YouTube as private · any size up to 256 GB · nothing is public until you press Publish</div></div>
          )}
        </div>
      ) : source === "blob" ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void uploadFile(f); }}
          onClick={() => fileRef.current?.click()}
          style={{ border: "2px dashed #d1d5db", borderRadius: 10, padding: 28, textAlign: "center", cursor: "pointer", background: blobUrl ? "#f0fdf4" : "#fafafa" }}
          data-testid="yt-drop"
        >
          <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.currentTarget.value = ""; }} />
          {blobUrl ? (
            <div><strong>{fileName}</strong><div style={muted}>uploaded · click to replace</div></div>
          ) : progress !== null ? (
            <div><strong>Uploading {fileName}</strong><div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, marginTop: 8 }}><div style={{ width: `${progress}%`, height: 8, background: "#dc2626", borderRadius: 4 }} /></div><div style={muted}>{progress}%</div></div>
          ) : (
            <div><strong>Drop the video here, or click to choose</strong><div style={muted}>MP4, WebM or MOV · under 95 MB · vertical ≤ 180 s becomes a Short</div></div>
          )}
        </div>
      ) : (
        <div>
          <div style={muted}>YouTube video URL or id (must be on our channel)</div>
          <input style={input} data-testid="yt-url" placeholder="https://www.youtube.com/watch?v=…" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
        </div>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <div>
          <div style={muted}>Desk title (Telugu, what the story is)</div>
          <input style={input} data-testid="yt-desk-title" value={deskTitle} onChange={(e) => setDeskTitle(e.target.value)} maxLength={120} placeholder="ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై దాడి" />
        </div>
        <div>
          <div style={muted}>Notes for the AI (optional: names, places, what matters)</div>
          <textarea style={{ ...input, minHeight: 70, fontFamily: "inherit" }} value={deskNotes} onChange={(e) => setDeskNotes(e.target.value)} maxLength={2000} />
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ cursor: "pointer" }}><input type="checkbox" checked={breaking} onChange={(e) => setBreaking(e.target.checked)} /> Breaking (badge on the thumbnail)</label>
          <label>District{" "}
            <select style={{ ...input, width: 200, display: "inline-block" }} value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="">auto-detect</option>
              {districts.map((d) => <option key={d.nameEn} value={d.nameEn}>{d.name} · {d.nameEn}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={muted}>Visibility after publish:</span>
          {(["public", "private", "scheduled"] as const).map((v) => (
            <label key={v} style={{ cursor: "pointer" }}><input type="radio" name="yt-vis" checked={visibility === v} onChange={() => setVisibility(v)} /> {v === "public" ? "Public now" : v === "private" ? "Private" : "Schedule at"}</label>
          ))}
          {visibility === "scheduled" && <input type="datetime-local" style={{ ...input, width: 220 }} value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" data-testid="yt-start" style={btn(true, !canStart)} disabled={!canStart} onClick={start}>Start Video IQ</button>
          <span style={muted}>Transcript, titles, SEO, thumbnails and channel fit; nothing is published until you press Publish.</span>
        </div>
      </div>
    </div>
  );
}
