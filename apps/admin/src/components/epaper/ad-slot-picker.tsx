"use client";

// Ad-slot picker (#145) — modal opened by clicking a masthead ad slot in
// the v2 editor. Lists active EpaperAdAsset rows; pick one → saves to
// EpaperEdition.mastheadAds[slotName].

import { useEffect, useState } from "react";

interface AdAsset {
  id: string;
  advertiser: string;
  imageUrl: string;
  linkUrl: string | null;
  validFrom: string | null;
  validTo: string | null;
}

export interface AdSlotPickerProps {
  editionId: string;
  slotName: string;                     // e.g. "ad-left", "ad-right"
  current?: string | null;              // currently-selected assetId for THIS slot
  onSave: (assetId: string) => void;    // parent commits to mastheadAds
  onClose: () => void;
}

export function AdSlotPicker({ editionId, slotName, current, onSave, onClose }: AdSlotPickerProps) {
  const [assets, setAssets] = useState<AdAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(current ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/epaper/ad-assets?active=1")
      .then((r) => r.json())
      .then((data) => setAssets(data.assets || data || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = assets.filter((a) => !query.trim() || a.advertiser.toLowerCase().includes(query.toLowerCase()));

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/epaper/edition/${editionId}/masthead-ads`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: slotName, assetId: selected }),
      });
      if (!r.ok) { alert(`Save failed (${r.status})`); return; }
      onSave(selected);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 8, padding: 18, maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Pick ad for slot: <code style={{ color: "#4f46e5" }}>{slotName}</code></h2>
        <input type="text" placeholder="search advertiser…" value={query} onChange={(e) => setQuery(e.target.value)}
          style={{ width: "100%", padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, marginBottom: 12 }} />

        {loading ? <p style={{ color: "#6b7280" }}>Loading…</p> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            {filtered.length === 0 && <p style={{ color: "#888", fontSize: 12, gridColumn: "1 / -1" }}>No active ad assets. Upload via /epaper-ads.</p>}
            {filtered.map((a) => {
              const isSel = selected === a.id;
              return (
                <button key={a.id} onClick={() => setSelected(a.id)}
                  style={{
                    background: isSel ? "#f0fdf4" : "#fafafa",
                    border: isSel ? "2px solid #16a34a" : "1px solid #e5e7eb",
                    borderRadius: 6, padding: 6, cursor: "pointer", textAlign: "left",
                  }}>
                  <div style={{ height: 60, background: "#f3f4f6", borderRadius: 3, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {a.imageUrl ? <img src={a.imageUrl} alt={a.advertiser} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span style={{ color: "#9ca3af", fontSize: 10 }}>no image</span>}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.advertiser}</div>
                  {isSel && <div style={{ fontSize: 10, color: "#16a34a", fontWeight: 800 }}>✓ SELECTED</div>}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "6px 14px", background: "#fff", color: "#6b7280", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={!selected || saving}
            style={{ padding: "6px 14px", background: selected ? "#4f46e5" : "#9ca3af", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: selected ? "pointer" : "not-allowed" }}>
            {saving ? "Saving…" : "Save for this edition"}
          </button>
        </div>
      </div>
    </div>
  );
}
