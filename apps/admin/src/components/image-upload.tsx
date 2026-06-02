"use client";

import { AlertTriangle, ImageIcon, Link2, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (url: string) => void;
  // Optional - when provided, renders a "Search images" action chip inside the
  // empty-state. Used by the content editor to open the free-images modal.
  // Consumers that don't need this leave it undefined and the chip disappears.
  onSearchClick?: () => void;
  // Forces upload-only mode: no URL paste row, no Search button. Used for
  // KYC documents where the user must actually upload the file (a URL to
  // an externally-hosted image isn't verifiable proof). Defaults to false.
  uploadOnly?: boolean;
  // Reports whether the current value is a valid, loaded image (false while
  // empty, pending, or broken). Lets the parent hide image-edit actions
  // (crop / AI enhance) when there's no real image to operate on.
  onValidChange?: (valid: boolean) => void;
}

export function ImageUpload({ value, onChange, onSearchClick, uploadOnly = false, onValidChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // URL field stays inline + always visible - editors paste image URLs often
  // enough that hiding it behind a toggle adds a click for no reason.
  const [urlDraft, setUrlDraft] = useState("");
  // True when the <img> failed to load. Most often: editor pasted a page
  // URL (e.g. `/photo/foo`) instead of a direct image URL (`.jpg`). We
  // surface this as a clear error block instead of silently rendering a
  // broken-image placeholder + alt text.
  const [imgError, setImgError] = useState(false);
  // Reset the error state whenever `value` changes - a new URL gets a
  // fresh chance to load.
  useEffect(() => {
    setImgError(false);
    // Newly-set (or empty) value isn't confirmed valid until the <img> below
    // fires onLoad; re-validated on load/error. Empty = not valid.
    onValidChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (data.warning) toast.warning(data.warning, { duration: 8000 });
      } else {
        toast.error(data.error || "Upload failed");
      }
    } catch (e: any) {
      toast.error("Upload failed: " + e.message);
    }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith("image/")) uploadFile(file);
  };

  const applyUrl = async () => {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    // A pasted base64 data: URL is huge (tens of KB) and would blow the
    // 2048-char URL cap on save. Rehost it through /api/upload - the same
    // path a file upload takes - and store the returned hosted URL instead.
    if (trimmed.startsWith("data:")) {
      setUrlDraft("");
      try {
        const blob = await (await fetch(trimmed)).blob();
        await uploadFile(new File([blob], "pasted-image", { type: blob.type || "image/jpeg" }));
      } catch {
        toast.error("Couldn't read that pasted image");
      }
      return;
    }
    onChange(trimmed);
    setUrlDraft("");
  };

  // ───── Preview state - an image is already set ─────────────────────────
  if (value) {
    return (
      <div className="space-y-2">
        {imgError ? (
          // Load failed - show an explanatory block instead of a broken
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
              onError={() => { setImgError(true); onValidChange?.(false); }}
              onLoad={() => { setImgError(false); onValidChange?.(true); }}
              className="block aspect-[16/9] w-full object-cover"
            />
          </div>
        )}

        {/* Persistent action row - always visible (no hover gate). Replaces
            the old overlay-on-hover pattern so editors can see the URL +
            controls at a glance. Same shape as the empty-state row, plus
            a Remove button. In `uploadOnly` mode the URL input is hidden
            (KYC documents must be uploaded, not linked) but Replace file
            + Remove stay so the user can still swap or clear the asset. */}
        <div className="flex items-center gap-2">
          {!uploadOnly && (
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
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={uploadOnly ? "ms-auto" : undefined}
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

        {/* Current URL - small, always-visible reference. Truncates with
            ellipsis but is selectable on click so editors can copy it. */}
        <p
          className="select-all truncate text-[11px] text-muted-foreground"
          title={value}
        >
          {value}
        </p>

        {/* Hidden file input - wired up so Replace file works without
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

  // ───── Empty state - no image yet ──────────────────────────────────────
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

      {/* URL row - always visible, no toggle. Most editors paste a URL
          when importing from another source, so making them click "Paste
          URL" first added an extra step for the common path. The Use
          action lives inside the input as a text affordance - it only
          lights up when there's something to apply.
          Hidden in `uploadOnly` mode (KYC documents) where the user MUST
          upload an actual file rather than link to an external host. */}
      {!uploadOnly && (
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
              placeholder="Paste image URL - https://…"
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
      )}

      {/* Hidden file input - single source for both the dropzone click
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
