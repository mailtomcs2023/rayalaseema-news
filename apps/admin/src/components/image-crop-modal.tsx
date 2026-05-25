// Image crop modal (Spec #1 G2 #129). Opens with a source image (URL or
// data URL), shows ReactCrop, returns the cropped result as a data URL on
// confirm. Caller decides whether to upload that data URL to Azure Blob or
// keep it inline (RichEditor inserts inline; ImageUpload re-uploads).
"use client";

import { useRef, useState, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
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
    }
  }, [aspect]);

  // Pick a new aspect — re-center the crop at that aspect.
  const setAspectAndRecenter = (a?: number) => {
    setAspect(a);
    if (imgRef.current && a) {
      const { width, height } = imgRef.current;
      setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 90 }, a, width, height), width, height));
    } else {
      setCrop(undefined);
    }
  };

  const applyCrop = async () => {
    if (!imgRef.current || !completedCrop) {
      // No crop drawn — return original
      onConfirm(src);
      return;
    }
    setSaving(true);
    try {
      const dataUrl = await drawCropToDataUrl(imgRef.current, completedCrop);
      onConfirm(dataUrl);
    } finally {
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

// Render the user's crop selection onto a canvas at native resolution and
// export it as a JPEG data URL. The native canvas approach avoids needing
// a server-side image worker — small images (<2MB) round-trip fine in the
// browser.
async function drawCropToDataUrl(img: HTMLImageElement, crop: PixelCrop): Promise<string> {
  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(crop.width * scaleX);
  canvas.height = Math.floor(crop.height * scaleY);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    crop.x * scaleX, crop.y * scaleY,
    crop.width * scaleX, crop.height * scaleY,
    0, 0,
    canvas.width, canvas.height,
  );
  return canvas.toDataURL("image/jpeg", 0.92);
}
