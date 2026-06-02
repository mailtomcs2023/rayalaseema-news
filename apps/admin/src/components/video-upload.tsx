"use client";

// Video picker for VIDEO / REEL content. Two ways to set the source:
//   1) Upload an MP4/WebM file - goes DIRECTLY to Azure Blob via a SAS URL
//      (bypasses the Next server's body limit), with a progress bar. Reads the
//      clip's duration automatically.
//   2) Paste a video URL (YouTube / already-hosted) - unchanged behaviour.
// No transcoding: 100 MB cap, MP4/WebM only (long video -> use a URL).
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Link2, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ALLOWED = ["video/mp4", "video/webm"];
const MAX_MB = 100;

interface Props {
  value: string;
  // durationSeconds is supplied when the source is an uploaded file (read from
  // the clip); omitted for pasted URLs. URL + duration come in ONE call so the
  // parent can set both without a stale-state race.
  onChange: (url: string, durationSeconds?: number) => void;
}

export function VideoUpload({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [urlDraft, setUrlDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const readDuration = (file: File) =>
    new Promise<number>((resolve) => {
      try {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => {
          const d = Number.isFinite(v.duration) ? Math.round(v.duration) : 0;
          URL.revokeObjectURL(v.src);
          resolve(d);
        };
        v.onerror = () => resolve(0);
        v.src = URL.createObjectURL(file);
      } catch {
        resolve(0);
      }
    });

  const uploadFile = async (file: File) => {
    if (!ALLOWED.includes(file.type)) {
      toast.error("Only MP4 or WebM videos can be uploaded. Convert the file, or paste a YouTube/hosted URL.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`Video is too large (${Math.round(file.size / 1024 / 1024)} MB). Max is ${MAX_MB} MB - for longer video, paste a YouTube/hosted URL.`);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const duration = await readDuration(file);
      // 1) Ask the server for a direct-to-Blob upload URL (SAS).
      const sasRes = await fetch("/api/upload/video-sas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      const sas = await sasRes.json().catch(() => ({}));
      if (!sasRes.ok || !sas.uploadUrl) {
        toast.error(sas.error || "Couldn't start the upload.");
        setUploading(false);
        return;
      }
      // 2) PUT the file straight to Azure Blob (XHR so we get upload progress).
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sas.uploadUrl);
        xhr.setRequestHeader("x-ms-blob-type", "BlockBlob");
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error("Upload failed - check your connection (or storage CORS)."));
        xhr.send(file);
      });
      onChange(sas.blobUrl, duration || undefined);
      toast.success("Video uploaded.");
    } catch (e: any) {
      toast.error(e?.message || "Video upload failed.");
    }
    setUploading(false);
    setProgress(0);
  };

  const applyUrl = () => {
    const t = urlDraft.trim();
    if (!t) return;
    onChange(t);
    setUrlDraft("");
  };

  const isPlayable = /\.(mp4|webm)(\?|$)/i.test(value) || value.includes(".blob.core.windows.net/");

  return (
    <div className="space-y-2">
      {value ? (
        <div className="space-y-2">
          {isPlayable ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={value} controls className="max-h-64 w-full rounded-md border bg-black" />
          ) : (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground break-all">{value}</div>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => onChange("")}
          >
            <Trash2 size={14} className="-ms-1 opacity-70" /> Remove
          </Button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !uploading && fileRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !uploading) {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-300 bg-muted/30 px-6 py-8 text-center hover:border-red-300"
        >
          {uploading ? (
            <>
              <Loader2 className="animate-spin text-muted-foreground" size={18} />
              <p className="text-sm text-muted-foreground">Uploading… {progress}%</p>
              <div className="h-1.5 w-44 overflow-hidden rounded bg-slate-200">
                <div className="h-full bg-red-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </>
          ) : (
            <>
              {/* Circled icon + py-8 matches ImageUpload so the dropzone keeps
                  the same height when the editor toggles Image <-> Video. */}
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm">
                <Upload size={18} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                Upload a video, or <span className="text-red-600 underline-offset-2 hover:underline">browse</span>
              </p>
              <p className="text-[11px] text-muted-foreground">MP4 or WebM · max {MAX_MB}MB</p>
            </>
          )}
        </div>
      )}

      {/* Paste-URL row (YouTube / already-hosted video). */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Link2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyUrl();
              }
            }}
            placeholder="…or paste a video URL (YouTube / hosted)"
            className="h-9 bg-white pl-8"
            disabled={uploading}
          />
        </div>
        <Button type="button" size="sm" variant="outline" onClick={applyUrl} disabled={!urlDraft.trim() || uploading}>
          Use URL
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) uploadFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
