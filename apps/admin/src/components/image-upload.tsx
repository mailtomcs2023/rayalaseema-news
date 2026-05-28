"use client";

import { AlertTriangle, ImageIcon, Link2, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (url: string) => void;
  // Optional — when provided, renders a "Search images" action chip inside the
  // empty-state. Used by the content editor to open the free-images modal.
  // Consumers that don't need this leave it undefined and the chip disappears.
  onSearchClick?: () => void;
}

export function ImageUpload({ value, onChange, onSearchClick }: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // URL field stays inline + always visible — editors paste image URLs often
  // enough that hiding it behind a toggle adds a click for no reason.
  const [urlDraft, setUrlDraft] = useState("");
  // True when the <img> failed to load. Most often: editor pasted a page
  // URL (e.g. `/photo/foo`) instead of a direct image URL (`.jpg`). We
  // surface this as a clear error block instead of silently rendering a
  // broken-image placeholder + alt text.
  const [imgError, setImgError] = useState(false);
  // Reset the error state whenever `value` changes — a new URL gets a
  // fresh chance to load.
  useEffect(() => {
    setImgError(false);
  }, [value]);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
        onChange(data.url);
      } else {
        alert(data.error || "Upload failed");
      }
    } catch (e: any) {
      alert("Upload failed: " + e.message);
    }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) uploadFile(file);
  };

  const applyUrl = () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setUrlDraft("");
  };

  // ───── Preview state — an image is already set ─────────────────────────
  if (value) {
    return (
      <div className="space-y-2">
        {imgError ? (
          // Load failed — show an explanatory block instead of a broken
          // <img>. Most common cause: pasted page URL, not image URL.
          <div className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold text-amber-900">
                  Couldn&apos;t load this URL as an image
                </p>
                <p className="text-xs text-amber-800">
                  The link points to a page, not a direct image file. Right-click the image on
                  the source site → &ldquo;Copy image address&rdquo; (URL should usually end in
                  <code className="mx-1 rounded bg-amber-100 px-1">.jpg</code>,
                  <code className="mx-1 rounded bg-amber-100 px-1">.png</code> or
                  <code className="mx-1 rounded bg-amber-100 px-1">.webp</code>) and try again.
                </p>
                <p className="break-all text-[11px] text-amber-700/80">{value}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Preview"
              onError={() => setImgError(true)}
              className="block aspect-[16/9] w-full object-cover"
            />
          </div>
        )}

        {/* Persistent action row — always visible (no hover gate). Replaces
            the old overlay-on-hover pattern so editors can see the URL +
            controls at a glance. Same shape as the empty-state row, plus
            a Remove button. */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Link2
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70"
            />
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
              placeholder="Paste a new image URL to replace…"
              className="h-9 bg-white pl-8 pr-14"
            />
            <button
              type="button"
              onClick={applyUrl}
              disabled={!urlDraft.trim()}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs font-semibold transition-colors",
                urlDraft.trim()
                  ? "text-red-600 hover:bg-red-50 cursor-pointer"
                  : "text-muted-foreground/40 cursor-not-allowed",
              )}
            >
              Use
            </button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} className="-ms-1 opacity-70" />
            Replace file
          </Button>
          {onSearchClick && (
            <Button type="button" size="sm" variant="outline" onClick={onSearchClick}>
              <ImageIcon size={14} className="-ms-1 opacity-70" />
              Search
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => onChange("")}
          >
            <Trash2 size={14} className="-ms-1 opacity-70" />
            Remove
          </Button>
        </div>

        {/* Current URL — small, always-visible reference. Truncates with
            ellipsis but is selectable on click so editors can copy it. */}
        <p
          className="select-all truncate text-[11px] text-muted-foreground"
          title={value}
        >
          {value}
        </p>

        {/* Hidden file input — wired up so Replace file works without
            re-mounting between states. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) uploadFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  // ───── Empty state — no image yet ──────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Primary affordance: dropzone. Click anywhere = file picker, drag
          works, looks intentional rather than skeletal. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors cursor-pointer",
          dragOver
            ? "border-red-400 bg-red-50"
            : "border-slate-300 bg-muted/30 hover:border-red-300 hover:bg-muted/50",
        )}
      >
        {uploading ? (
          <p className="text-sm text-muted-foreground">Uploading…</p>
        ) : (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm">
              <Upload size={18} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              Drop an image, or <span className="text-red-600 underline-offset-2 hover:underline">browse</span>
            </p>
            <p className="text-[11px] text-muted-foreground">JPEG, PNG, WebP · max 5MB</p>
          </>
        )}
      </div>

      {/* URL row — always visible, no toggle. Most editors paste a URL
          when importing from another source, so making them click "Paste
          URL" first added an extra step for the common path. The Use
          action lives inside the input as a text affordance — it only
          lights up when there's something to apply. */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Link2
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70"
          />
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
            placeholder="Paste image URL — https://…"
            className="h-9 bg-white pl-8 pr-14"
          />
          <button
            type="button"
            onClick={applyUrl}
            disabled={!urlDraft.trim()}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs font-semibold transition-colors",
              urlDraft.trim()
                ? "text-red-600 hover:bg-red-50 cursor-pointer"
                : "text-muted-foreground/40 cursor-not-allowed",
            )}
          >
            Use
          </button>
        </div>
        {onSearchClick && (
          <Button type="button" size="sm" variant="outline" onClick={onSearchClick}>
            <ImageIcon size={14} className="-ms-1 opacity-70" />
            Search free images
          </Button>
        )}
      </div>

      {/* Hidden file input — single source for both the dropzone click
          and the keyboard Enter affordance above. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) uploadFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
