// Payload sub-editor for non-ARTICLE ContentTypes (Spec #1 F2-F6).
// Switches on `type` and renders the per-type field set. Each subform reads
// from and writes to the parent's `payload` state via setPayload(next).
//
// Validation happens server-side via Zod (packages/db/src/payload-schemas.ts),
// so the client form stays permissive: empty strings allowed, types coerced
// at submit time. Field errors come back as fieldErrors in the API response
// and bubble up through the parent.
"use client";

import { useState } from "react";
import { ImageUpload } from "@/components/image-upload";
import { VideoUpload } from "@/components/video-upload";
import { DatePicker } from "@/components/ui/date-picker";
import { DateTimePicker } from "@/components/ui/date-time-picker";

type Payload = Record<string, unknown>;

export interface ContentPayloadEditorProps {
  type: string;
  payload: Payload;
  setPayload: (next: Payload) => void;
}

export function ContentPayloadEditor({ type, payload, setPayload }: ContentPayloadEditorProps) {
  const upd = (patch: Payload) => setPayload({ ...payload, ...patch });

  if (type === "VIDEO") {
    // F2 - VIDEO subform. videoUrl + duration (sec) + optional thumbnail.
    return (
      <SectionBox title="Video details">
        <Field label="Video (upload MP4/WebM, or paste a YouTube/hosted URL)">
          <VideoUpload
            value={(payload.videoUrl as string) || ""}
            onChange={(v, secs) => upd(secs != null ? { videoUrl: v, duration: secs } : { videoUrl: v })}
          />
        </Field>
        <Field label="Duration (seconds)">
          <input type="number" min="0" value={String(payload.duration ?? "")}
            onChange={(e) => upd({ duration: Number(e.target.value) })}
            style={inpStyle} />
        </Field>
        <Field label="Thumbnail (override featured image)">
          <ImageUpload value={(payload.thumbnailUrl as string) || ""}
            onChange={(v) => upd({ thumbnailUrl: v })} />
        </Field>
      </SectionBox>
    );
  }

  if (type === "REEL") {
    // F2 - REEL subform. Vertical short clip URL + duration.
    return (
      <SectionBox title="Reel details">
        <Field label="Clip (upload vertical 9:16 MP4/WebM, or paste a hosted URL)">
          <VideoUpload
            value={(payload.clipUrl as string) || ""}
            onChange={(v, secs) => upd(secs != null ? { clipUrl: v, duration: secs } : { clipUrl: v })}
          />
        </Field>
        <Field label="Duration (seconds)">
          <input type="number" min="0" value={String(payload.duration ?? "")}
            onChange={(e) => upd({ duration: Number(e.target.value) })}
            style={inpStyle} />
        </Field>
      </SectionBox>
    );
  }

  if (type === "WEB_STORY") {
    // F3 - slide builder. Add/remove rows; per-slide image + caption. Reorder
    // via up/down buttons (drag-drop in a polish PR).
    const slides = (Array.isArray(payload.slides) ? payload.slides : []) as Array<{ image: string; caption?: string }>;
    const setSlides = (next: typeof slides) => upd({ slides: next });
    const moveSlide = (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (j < 0 || j >= slides.length) return;
      const copy = [...slides];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      setSlides(copy);
    };
    return (
      <SectionBox title={`Slides (${slides.length})`}>
        {slides.map((s, i) => (
          <div key={i} style={{ padding: 12, marginBottom: 10, background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: 12, color: "#374151" }}>Slide {i + 1}</strong>
              <div style={{ flex: 1 }} />
              <button onClick={() => moveSlide(i, -1)} disabled={i === 0} style={btnSmall}>↑</button>
              <button onClick={() => moveSlide(i, 1)} disabled={i === slides.length - 1} style={btnSmall}>↓</button>
              <button onClick={() => setSlides(slides.filter((_, k) => k !== i))} style={{ ...btnSmall, color: "#dc2626" }}>✕</button>
            </div>
            <ImageUpload value={s.image} onChange={(v) => {
              const copy = [...slides]; copy[i] = { ...s, image: v }; setSlides(copy);
            }} />
            <Field label="Caption">
              <textarea rows={2} value={s.caption || ""} onChange={(e) => {
                const copy = [...slides]; copy[i] = { ...s, caption: e.target.value }; setSlides(copy);
              }} style={{ ...inpStyle, resize: "vertical" }} />
            </Field>
          </div>
        ))}
        <button onClick={() => setSlides([...slides, { image: "", caption: "" }])}
          style={{ padding: "8px 16px", background: "#fbbf24", color: "#78350f", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          + Add slide
        </button>
      </SectionBox>
    );
  }

  if (type === "PHOTO_GALLERY") {
    // F4 - multi-photo. Same shape as slides but no ordering UI required by
    // most galleries; still expose move buttons for cover-image ordering.
    const photos = (Array.isArray(payload.photos) ? payload.photos : []) as Array<{ url: string; caption?: string }>;
    const setPhotos = (next: typeof photos) => upd({ photos: next });
    const move = (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (j < 0 || j >= photos.length) return;
      const copy = [...photos];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      setPhotos(copy);
    };
    return (
      <SectionBox title={`Photos (${photos.length})`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          {photos.map((p, i) => (
            <div key={i} style={{ padding: 8, background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 8 }}>
              <ImageUpload value={p.url} onChange={(v) => {
                const copy = [...photos]; copy[i] = { ...p, url: v }; setPhotos(copy);
              }} />
              <input value={p.caption || ""} onChange={(e) => {
                const copy = [...photos]; copy[i] = { ...p, caption: e.target.value }; setPhotos(copy);
              }} placeholder="Caption (optional)" style={{ ...inpStyle, marginTop: 6, fontSize: 12 }} />
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <button onClick={() => move(i, -1)} disabled={i === 0} style={btnSmall}>↑</button>
                <button onClick={() => move(i, 1)} disabled={i === photos.length - 1} style={btnSmall}>↓</button>
                <button onClick={() => setPhotos(photos.filter((_, k) => k !== i))} style={{ ...btnSmall, color: "#dc2626", marginLeft: "auto" }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setPhotos([...photos, { url: "", caption: "" }])}
          style={{ marginTop: 10, padding: "8px 16px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          + Add photo
        </button>
      </SectionBox>
    );
  }

  if (type === "CARTOON") {
    // F5 - single image (use featuredImage on the parent) + caption + date.
    // Date defaults to today on first edit; stored as ISO datetime string.
    return (
      <SectionBox title="Cartoon details">
        <Field label="Caption">
          <textarea rows={3} value={(payload.caption as string) || ""}
            onChange={(e) => upd({ caption: e.target.value })}
            placeholder="రాజకీయ వ్యంగ్యం…" style={{ ...inpStyle, resize: "vertical" }} />
        </Field>
        <Field label="Publish date">
          <DatePicker
            value={dateOnly((payload.date as string) || "")}
            onChange={(v) => upd({ date: v ? new Date(v).toISOString() : undefined })}
          />
        </Field>
        <p style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
          Cartoon image lives in the featured-image slot (parent sidebar). No body / no separate gallery.
        </p>
      </SectionBox>
    );
  }

  if (type === "BREAKING_NEWS") {
    // F6 - ticker headline. No body, no image, slug auto-generated. Priority
    // 1 = top of ticker; expiresAt auto-hides on the public side.
    return (
      <SectionBox title="Breaking ticker">
        <Field label="Priority (1 = top, 10 = bottom)">
          <select value={String(payload.priority ?? 5)}
            onChange={(e) => upd({ priority: Number(e.target.value) })}
            style={inpStyle}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="Expires at (auto-hides after)">
          <DateTimePicker
            value={dateTimeLocal((payload.expiresAt as string) || "")}
            onChange={(v) => upd({ expiresAt: v ? new Date(v).toISOString() : undefined })}
          />
        </Field>
        <Field label="Link to full story (optional)">
          <input
            type="text"
            value={(payload.url as string) || ""}
            onChange={(e) => upd({ url: e.target.value.trim() || undefined })}
            placeholder="/kurnool/... or https://…"
            style={inpStyle}
          />
        </Field>
        <p style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
          The title shows in the ticker. Add a link to make it open the full
          story (on the /breaking page); leave it blank for a headline-only alert.
        </p>
      </SectionBox>
    );
  }

  return null;
}

// --- helpers ---

function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12, padding: 16, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function dateOnly(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function dateTimeLocal(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

const inpStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff", boxSizing: "border-box" };
const btnSmall: React.CSSProperties = { padding: "4px 10px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" };
