"use client";
// /youtube/new: upload a video (or point at an existing channel video), give
// the desk context, and start Video IQ. The upload goes straight to blob via
// the same SAS flow the Content editor uses.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ToastViewport, useToasts } from "@/components/toast";
import { ui } from "@/components/video-iq/tabs";

const { btn, input, muted } = ui;
const ALLOWED = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_MB = 2048;

export function NewRunForm() {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [source, setSource] = useState<"blob" | "youtube">("blob");
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
        xhr.setRequestHeader("x-ms-blob-type", "BlockBlob");
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

  async function start() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { source, deskTitle: deskTitle.trim(), deskNotes: deskNotes.trim() || undefined, breaking, district: district || undefined, visibility };
      if (source === "blob") body.blobUrl = blobUrl;
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

  const canStart = !busy && deskTitle.trim().length >= 3 && (source === "blob" ? Boolean(blobUrl) : videoUrl.trim().length > 0) && (visibility !== "scheduled" || Boolean(publishAt));

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, maxWidth: 820 }}>
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
      <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
        <label style={{ cursor: "pointer" }}><input type="radio" checked={source === "blob"} onChange={() => setSource("blob")} /> Upload a video file</label>
        <label style={{ cursor: "pointer" }}><input type="radio" checked={source === "youtube"} onChange={() => setSource("youtube")} /> Existing video on the channel</label>
      </div>

      {source === "blob" ? (
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
            <div><strong>Drop the video here, or click to choose</strong><div style={muted}>MP4, WebM or MOV · up to 2 GB · vertical ≤ 180 s becomes a Short</div></div>
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
