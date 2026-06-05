"use client";

import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { confirm } from "@/components/confirm-dialog";

// ============ Position metadata ============
// Recommended sizes per IAB Display Ad Guidelines + our actual slot footprint.

type PositionMeta = {
  value: string;
  label: string;
  w: number;
  h: number;
  aspect: number;
  description: string;
};

const POSITIONS: PositionMeta[] = [
  { value: "LEADERBOARD",    label: "Masthead Leaderboard",          w: 728, h: 90,  aspect: 728 / 90,  description: "Top of every page, beside the logo. 728x90 standard banner. (Tablet + desktop.)" },
  { value: "MOBILE_ANCHOR",  label: "Mobile Sticky Bottom",          w: 320, h: 100, aspect: 320 / 100, description: "Sticks to the bottom of the viewport on phones only. Highest-revenue mobile slot." },
  { value: "BANNER_MID",     label: "Mid-page Banner",                w: 970, h: 250, aspect: 970 / 250, description: "Below the hero slider. High-visibility large rectangle." },
  { value: "HEADER_LEFT",    label: "Header Left Strip",              w: 200, h: 60,  aspect: 200 / 60,  description: "Small slot left of the masthead." },
  { value: "HEADER_RIGHT",   label: "Header Right Strip",             w: 200, h: 60,  aspect: 200 / 60,  description: "Small slot right of the masthead." },
  { value: "SIDEBAR_SQUARE", label: "Sidebar Square (300x250)",       w: 300, h: 250, aspect: 300 / 250, description: "Medium rectangle in the sidebar." },
  { value: "SIDEBAR_TALL",   label: "Sidebar Tall (300x600)",         w: 300, h: 600, aspect: 300 / 600, description: "Half-page skyscraper in the sidebar." },
  { value: "IN_FEED",        label: "In-Feed (between articles)",      w: 728, h: 90,  aspect: 728 / 90,  description: "Slots between article cards in lists." },
  { value: "VERTICAL_STRIP", label: "Vertical Strip (fixed sidebar)", w: 160, h: 600, aspect: 160 / 600, description: "Sticky vertical strip down the side of articles." },
];

const POSITION_BY_VALUE: Record<string, PositionMeta> = Object.fromEntries(
  POSITIONS.map((p) => [p.value, p])
);

// ============ Types ============

export type AdRow = {
  id: string;
  name: string;
  position: string;
  imageUrl: string | null;
  linkUrl: string | null;
  htmlContent: string | null;
  bgColor: string | null;
  textColor: string | null;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  clicks: number;
  impressions: number;
};

type LinkMode = "url" | "whatsapp" | "internal";

function decodeLinkMode(linkUrl: string | null): LinkMode {
  if (!linkUrl) return "url";
  if (linkUrl.startsWith("https://wa.me/")) return "whatsapp";
  if (linkUrl.startsWith("/")) return "internal";
  return "url";
}

function parseWhatsapp(linkUrl: string | null): { phone: string; msg: string } {
  if (!linkUrl) return { phone: "", msg: "" };
  const m = linkUrl.match(/^https:\/\/wa\.me\/(\d+)(?:\?text=(.*))?$/);
  if (!m) return { phone: "", msg: "" };
  return { phone: m[1], msg: m[2] ? decodeURIComponent(m[2]) : "" };
}

function buildWhatsapp(phone: string, msg: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const base = `https://wa.me/${digits}`;
  if (!msg) return base;
  return `${base}?text=${encodeURIComponent(msg)}`;
}

// ============ Crop helpers ============

function centerInitialCrop(imgW: number, imgH: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, aspect, imgW, imgH),
    imgW,
    imgH
  );
}

async function cropImageToBlob(
  image: HTMLImageElement,
  pixelCrop: PixelCrop,
  outW: number,
  outH: number
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const sx = pixelCrop.x * (image.naturalWidth / image.width);
  const sy = pixelCrop.y * (image.naturalHeight / image.height);
  const sw = pixelCrop.width * (image.naturalWidth / image.width);
  const sh = pixelCrop.height * (image.naturalHeight / image.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
}

// ============ Component ============

export function AdsManager({ initialAds }: { initialAds: AdRow[] }) {
  const [ads, setAds] = useState<AdRow[]>(initialAds);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startNew() {
    setEditingId("new");
    setError(null);
  }
  function startEdit(id: string) {
    setEditingId(id);
    setError(null);
  }
  function closeEditor() {
    setEditingId(null);
    setError(null);
  }

  async function refresh() {
    const r = await fetch("/api/ads");
    if (r.ok) setAds(await r.json());
  }

  async function toggleActive(ad: AdRow) {
    await fetch(`/api/ads/${ad.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !ad.active }),
    });
    refresh();
  }

  async function deleteAd(ad: AdRow) {
    if (
      !(await confirm({
        title: `Delete ad "${ad.name}"?`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    await fetch(`/api/ads/${ad.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Advertisements</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Custom in-house ads. Show before AdSense in their position slot. Click tracking + impressions automatic.
          </p>
        </div>
        <button
          onClick={startNew}
          style={{ background: "#E01B1B", color: "#fff", padding: "10px 18px", border: 0, borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
        >
          + New Ad
        </button>
      </div>

      {editingId && (
        <AdEditor
          key={editingId}
          ad={editingId === "new" ? null : ads.find((a) => a.id === editingId) || null}
          onCancel={closeEditor}
          onSaved={() => {
            closeEditor();
            refresh();
          }}
          onError={setError}
        />
      )}

      {error && (
        <div style={{ background: "#fee", border: "1px solid #fcc", color: "#900", padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead style={{ background: "#f9fafb", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
            <tr>
              <th style={{ padding: "10px 12px", fontWeight: 600 }}>Preview</th>
              <th style={{ padding: "10px 12px", fontWeight: 600 }}>Name</th>
              <th style={{ padding: "10px 12px", fontWeight: 600 }}>Position</th>
              <th style={{ padding: "10px 12px", fontWeight: 600 }}>Status</th>
              <th style={{ padding: "10px 12px", fontWeight: 600 }}>Stats</th>
              <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ads.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 28, textAlign: "center", color: "#9ca3af" }}>
                  No ads yet - click <strong>+ New Ad</strong> to create one.
                </td>
              </tr>
            )}
            {ads.map((ad) => (
              <tr key={ad.id} style={{ borderBottom: "1px solid #f0f1f3" }}>
                <td style={{ padding: "10px 12px" }}>
                  {ad.imageUrl ? (
                    <img src={ad.imageUrl} alt={ad.name} style={{ height: 36, maxWidth: 140, objectFit: "contain" }} />
                  ) : (
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>(html)</span>
                  )}
                </td>
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>{ad.name}</td>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ fontSize: 12, color: "#374151" }}>
                    {POSITION_BY_VALUE[ad.position]?.label || ad.position}
                  </span>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <button
                    onClick={() => toggleActive(ad)}
                    style={{
                      background: ad.active ? "#10b981" : "#9ca3af",
                      color: "#fff",
                      padding: "3px 9px",
                      borderRadius: 12,
                      border: 0,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {ad.active ? "Active" : "Off"}
                  </button>
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: "#6b7280" }}>
                  {ad.impressions.toLocaleString()} imps · {ad.clicks.toLocaleString()} clicks
                  {ad.impressions > 0 && (
                    <span style={{ marginLeft: 4 }}>
                      ({((ad.clicks / ad.impressions) * 100).toFixed(2)}%)
                    </span>
                  )}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  <button
                    onClick={() => startEdit(ad.id)}
                    style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer", marginRight: 4 }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteAd(ad)}
                    style={{ background: "#fff", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ Editor (Modal) ============

function AdEditor({
  ad,
  onCancel,
  onSaved,
  onError,
}: {
  ad: AdRow | null;
  onCancel: () => void;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const [name, setName] = useState(ad?.name ?? "");
  const [position, setPosition] = useState(ad?.position ?? "LEADERBOARD");
  const [imageUrl, setImageUrl] = useState(ad?.imageUrl ?? "");
  const initialLinkMode = decodeLinkMode(ad?.linkUrl ?? null);
  const initialWa = parseWhatsapp(ad?.linkUrl ?? null);
  const [linkMode, setLinkMode] = useState<LinkMode>(initialLinkMode);
  const [linkUrl, setLinkUrl] = useState(initialLinkMode === "url" ? ad?.linkUrl ?? "" : "");
  const [internalPath, setInternalPath] = useState(initialLinkMode === "internal" ? ad?.linkUrl ?? "" : "");
  const [whatsappPhone, setWhatsappPhone] = useState(initialWa.phone);
  const [whatsappMsg, setWhatsappMsg] = useState(initialWa.msg);
  const [active, setActive] = useState(ad?.active ?? true);
  const [startDate, setStartDate] = useState(ad?.startDate ? ad.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(ad?.endDate ? ad.endDate.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);

  // Upload + crop
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const posMeta = POSITION_BY_VALUE[position];

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      onError("Image too large (5MB max).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setRawSrc(reader.result as string);
    reader.readAsDataURL(f);
    onError(null);
  }

  function onImgLoaded(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    setCrop(centerInitialCrop(width, height, posMeta.aspect));
  }

  async function uploadCroppedImage() {
    if (!imgRef.current || !completedCrop) {
      onError("Make a crop selection first.");
      return;
    }
    setUploading(true);
    try {
      const blob = await cropImageToBlob(imgRef.current, completedCrop, posMeta.w * 2, posMeta.h * 2);
      if (!blob) throw new Error("Crop failed.");
      const fd = new FormData();
      fd.append("file", blob, "ad.png");
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Upload failed: ${r.status} ${txt.slice(0, 200)}`);
      }
      const j = await r.json();
      if (!j.url) throw new Error("Upload returned no URL.");
      setImageUrl(j.url);
      setRawSrc(null);
    } catch (e: any) {
      onError(e.message || String(e));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    onError(null);
    if (!name.trim()) {
      onError("Name is required.");
      return;
    }
    if (!imageUrl) {
      onError("Image is required (upload + crop first).");
      return;
    }
    let resolvedLink: string | null = null;
    if (linkMode === "url") resolvedLink = linkUrl.trim() || null;
    else if (linkMode === "internal") resolvedLink = internalPath.trim() || null;
    else if (linkMode === "whatsapp") {
      const built = buildWhatsapp(whatsappPhone, whatsappMsg);
      if (!built) {
        onError("WhatsApp phone is required (10+ digits, no spaces).");
        return;
      }
      resolvedLink = built;
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      position,
      imageUrl,
      linkUrl: resolvedLink,
      active,
      startDate: startDate || null,
      endDate: endDate || null,
    };

    setSaving(true);
    try {
      const r = await fetch(ad ? `/api/ads/${ad.id}` : "/api/ads", {
        method: ad ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Save failed: ${r.status} ${txt.slice(0, 200)}`);
      }
      onSaved();
    } catch (e: any) {
      onError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  const previewBg = position.includes("HEADER") || position === "LEADERBOARD" ? "#f4f5f7" : "#fafbfc";

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 22, marginBottom: 22, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>
          {ad ? `Edit: ${ad.name}` : "New Ad"}
        </h2>
        <button onClick={onCancel} style={{ background: "transparent", border: 0, color: "#6b7280", cursor: "pointer", fontSize: 22 }}>×</button>
      </div>

      {/* Row 1: name + position */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="Ad Name (admin reference, not shown to readers)">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. We Are Hiring – Anchors + Copywriters" style={inputStyle} />
        </Field>
        <Field label="Slot Position">
          <select value={position} onChange={(e) => setPosition(e.target.value)} style={inputStyle}>
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} ({p.w}×{p.h})
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{posMeta.description}</div>
        </Field>
      </div>

      {/* Row 2: image upload + crop */}
      <Field label={`Image (recommended ${posMeta.w}×${posMeta.h}, aspect ${posMeta.aspect.toFixed(2)}:1)`}>
        {!rawSrc && imageUrl && (
          <div style={{ background: previewBg, padding: 10, borderRadius: 6, marginBottom: 8 }}>
            <img src={imageUrl} alt="current" style={{ maxWidth: "100%", maxHeight: 120, display: "block" }} />
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
              Current image. Choose a new file to replace + re-crop.
            </div>
          </div>
        )}
        {!rawSrc && (
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={onFileChosen}
            style={{ fontSize: 13 }}
          />
        )}
        {rawSrc && (
          <div style={{ marginTop: 8 }}>
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={posMeta.aspect}
              keepSelection
            >
              <img ref={imgRef} src={rawSrc} onLoad={onImgLoaded} style={{ maxHeight: 380 }} alt="crop source" />
            </ReactCrop>
            <div style={{ marginTop: 8 }}>
              <button
                onClick={uploadCroppedImage}
                disabled={uploading || !completedCrop}
                style={{ background: "#2563eb", color: "#fff", padding: "8px 16px", border: 0, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: uploading ? "wait" : "pointer", marginRight: 8 }}
              >
                {uploading ? "Uploading…" : "Crop + Upload"}
              </button>
              <button
                onClick={() => setRawSrc(null)}
                style={{ background: "#fff", border: "1px solid #d1d5db", padding: "8px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer" }}
              >
                Cancel crop
              </button>
            </div>
          </div>
        )}
      </Field>

      {/* Row 3: link mode */}
      <Field label="Click destination">
        <div style={{ display: "flex", gap: 14, marginBottom: 10, fontSize: 13 }}>
          {(["url", "whatsapp", "internal"] as const).map((m) => (
            <label key={m} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
              <input
                type="radio"
                name="linkMode"
                value={m}
                checked={linkMode === m}
                onChange={() => setLinkMode(m)}
              />
              {m === "url" ? "External URL" : m === "whatsapp" ? "WhatsApp Chat" : "Internal Page"}
            </label>
          ))}
        </div>
        {linkMode === "url" && (
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com/landing-page" style={inputStyle} />
        )}
        {linkMode === "internal" && (
          <input value={internalPath} onChange={(e) => setInternalPath(e.target.value)} placeholder="/contact   or   /district/kurnool" style={inputStyle} />
        )}
        {linkMode === "whatsapp" && (
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10 }}>
            <input value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} placeholder="919959959580" style={inputStyle} />
            <input value={whatsappMsg} onChange={(e) => setWhatsappMsg(e.target.value)} placeholder="Hello, I saw your ad for…" style={inputStyle} />
            <div style={{ gridColumn: "1 / span 2", fontSize: 11, color: "#6b7280" }}>
              Phone with country code, digits only (no +, no spaces). Tap will open:
              <code style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 3, marginLeft: 4 }}>
                {buildWhatsapp(whatsappPhone, whatsappMsg) || "(set phone)"}
              </code>
            </div>
          </div>
        )}
      </Field>

      {/* Row 4: schedule + active */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
        <Field label="Start (optional)">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="End (optional)">
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Status">
          <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active (shown to readers)
          </label>
        </Field>
      </div>

      {/* Live preview */}
      {imageUrl && (
        <div style={{ background: previewBg, border: "1px dashed #d1d5db", borderRadius: 6, padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>
            Live Preview ({posMeta.label})
          </div>
          <div style={{ background: "#fff", padding: 8, borderRadius: 4, display: "inline-block" }}>
            <img src={imageUrl} alt="preview" style={{ maxHeight: 90, maxWidth: posMeta.w, display: "block" }} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onCancel} style={{ background: "#fff", border: "1px solid #d1d5db", padding: "9px 18px", borderRadius: 6, fontSize: 14, cursor: "pointer" }}>
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          style={{ background: "#E01B1B", color: "#fff", padding: "9px 22px", border: 0, borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: saving ? "wait" : "pointer" }}
        >
          {saving ? "Saving…" : ad ? "Update Ad" : "Create Ad"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 5,
  fontSize: 13,
  fontFamily: "inherit",
};
