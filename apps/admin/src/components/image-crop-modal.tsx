// Image crop modal (Spec #1 G2 #129). Opens with a source image (URL or
// data URL), shows ReactCrop, returns the cropped result as a data URL on
// confirm. Caller decides whether to upload that data URL to Azure Blob or
// keep it inline (RichEditor inserts inline; ImageUpload re-uploads).
"use client";

import { useRef, useState, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop, convertToPixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

export interface ImageCropModalProps {
  src: string;
  onConfirm: (croppedDataUrl: string) => void;
  onClose: () => void;
}

const ASPECTS = [
  { label: "Free", value: undefined },
  { label: "16:9", value: 16 / 9 },
  { label: "4:3", value: 4 / 3 },
  { label: "1:1", value: 1 },
  { label: "3:2", value: 3 / 2 },
] as const;

export function ImageCropModal({ src, onConfirm, onClose }: ImageCropModalProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(16 / 9);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // When image loads, pre-set a centered 90% crop at the chosen aspect.
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (aspect) {
      const c = centerCrop(
        makeAspectCrop({ unit: "%", width: 90 }, aspect, width, height),
        width,
        height,
      );
      setCrop(c);
      // Seed completedCrop too, so Apply works even if the user never drags
      // (otherwise applyCrop sees no completedCrop and returns the original).
      setCompletedCrop(convertToPixelCrop(c, width, height));
    }
  }, [aspect]);

  // Pick a new aspect - re-center the crop at that aspect. Crucially also sync
  // completedCrop: programmatic setCrop does NOT fire ReactCrop's onComplete,
  // so without this, clicking a ratio then Apply (without re-dragging) would
  // save the PREVIOUS selection's ratio. Free mode clears both - the user then
  // draws their own selection.
  const setAspectAndRecenter = (a?: number) => {
    setAspect(a);
    if (imgRef.current && a) {
      const { width, height } = imgRef.current;
      const c = centerCrop(makeAspectCrop({ unit: "%", width: 90 }, a, width, height), width, height);
      setCrop(c);
      setCompletedCrop(convertToPixelCrop(c, width, height));
    } else {
      setCrop(undefined);
      setCompletedCrop(undefined);
    }
  };

  const applyCrop = async () => {
    const img = imgRef.current;
    if (!img || !completedCrop || completedCrop.width < 1 || completedCrop.height < 1) {
      // No crop drawn - keep the original image untouched.
      onConfirm(src);
      return;
    }
    setSaving(true);
    setError("");
    try {
      // Convert the on-screen (displayed) selection to NATURAL pixels so the
      // server crops the full-resolution source, not the scaled-down preview.
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      const res = await fetch("/api/upload/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          src,
          x: completedCrop.x * scaleX,
          y: completedCrop.y * scaleY,
          width: completedCrop.width * scaleX,
          height: completedCrop.height * scaleY,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || `Crop failed (${res.status}). Please try again.`);
        setSaving(false);
        return;
      }
      onConfirm(data.url);
    } catch (e) {
      setError((e as Error)?.message || "Crop failed. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 12, maxWidth: 900, width: "100%", maxHeight: "90vh", overflow: "auto", padding: 20 }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Crop image</h2>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 6 }}>
            {ASPECTS.map((a) => (
              <button
                key={a.label}
                onClick={() => setAspectAndRecenter(a.value)}
                style={{
                  padding: "4px 10px",
                  background: aspect === a.value ? "#111827" : "#f3f4f6",
                  color: aspect === a.value ? "#fff" : "#374151",
                  border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: "#f3f4f6", borderRadius: 8, padding: 12, display: "flex", justifyContent: "center" }}>
          <ReactCrop
            crop={crop}
            aspect={aspect}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            keepSelection
          >
            <img
              ref={imgRef}
              src={src}
              alt="To crop"
              onLoad={onImageLoad}
              style={{ maxHeight: "60vh", maxWidth: "100%" }}
              crossOrigin="anonymous"
            />
          </ReactCrop>
        </div>

        {error && (
          <p style={{ marginTop: 12, color: "#dc2626", fontSize: 13, fontWeight: 600 }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose}
            style={{ padding: "8px 16px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={applyCrop} disabled={saving}
            style={{ padding: "8px 20px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Cropping..." : "Apply crop"}
          </button>
        </div>
      </div>
    </div>
  );
}

