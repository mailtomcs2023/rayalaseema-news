// /media-library - SharePoint-mirrored media browser. Lists every
// blob upload that's been mirrored to repress.sharepoint.com so
// editors can find / reuse / copy URLs without leaving the admin.
//
// Picker UX: filters at top (district, year, month, filename),
// thumbnail grid below, click to copy blob URL or open in SP.
"use client";

import { useState, useEffect, useCallback } from "react";

interface PickerItem {
  blobUrl: string;
  spWebUrl: string | null;
  spFolderPath: string | null;
  spFileName: string | null;
  role: string;
  roleIndex: number;
  mimeType: string;
  contentId: string | null;
  contentSlug?: string | null;
  createdAt: string;
}

const DISTRICTS = [
  { value: "", label: "All folders" },
  { value: "Kurnool", label: "Kurnool" },
  { value: "Nandyal", label: "Nandyal" },
  { value: "Ananthapuramu", label: "Ananthapuramu" },
  { value: "Sri-Sathya-Sai", label: "Sri Sathya Sai" },
  { value: "YSR-Kadapa", label: "YSR Kadapa" },
  { value: "Annamayya", label: "Annamayya" },
  { value: "Tirupati", label: "Tirupati" },
  { value: "Chittoor", label: "Chittoor" },
  { value: "_Statewide", label: "_Statewide" },
];

function thisYear() { return String(new Date().getFullYear()); }
function thisMonth() { return String(new Date().getMonth() + 1).padStart(2, "0"); }

export default function MediaLibraryPage() {
  const [items, setItems] = useState<PickerItem[]>([]);
  const [district, setDistrict] = useState("");
  const [yyyy, setYyyy] = useState("");
  const [mm, setMm] = useState("");
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const fetchPage = useCallback(async (append: boolean) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (district) params.set("district", district);
      if (yyyy) params.set("yyyy", yyyy);
      if (mm) params.set("mm", mm);
      if (q.trim()) params.set("q", q.trim());
      if (append && cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/media/sp-picker?${params}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || `API ${res.status}`); return; }
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor || null);
      setHasMore(Boolean(data.nextCursor));
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [district, yyyy, mm, q, cursor]);

  // Refetch from scratch whenever filters change. Cursor is reset so
  // we don't accidentally append paginated results from a stale filter.
  useEffect(() => {
    setCursor(null);
    fetchPage(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district, yyyy, mm]);

  const onSearch = () => { setCursor(null); fetchPage(false); };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500);
    } catch {
      window.prompt("Copy URL:", url);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>Media Library</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            Every image + video uploaded through admin lands here, mirrored to SharePoint
            (repress.sharepoint.com / sites / rayalaseemaexpress). Click a thumbnail to
            copy its CDN URL.
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, background: "#fff", padding: 12, borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <select value={district} onChange={(e) => setDistrict(e.target.value)}
            style={fieldStyle}>
            {DISTRICTS.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
          </select>
          <select value={yyyy} onChange={(e) => setYyyy(e.target.value)} style={fieldStyle}>
            <option value="">Any year</option>
            <option value={thisYear()}>{thisYear()}</option>
            <option value={String(Number(thisYear()) - 1)}>{Number(thisYear()) - 1}</option>
          </select>
          <select value={mm} onChange={(e) => setMm(e.target.value)} style={fieldStyle}>
            <option value="">Any month</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filename / slug filter…"
            onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
            style={{ ...fieldStyle, flex: "1 1 240px" }}
          />
          <button onClick={onSearch} disabled={loading}
            style={{ ...fieldStyle, background: "#dc2626", color: "#fff", border: "none", fontWeight: 700, cursor: loading ? "wait" : "pointer", padding: "10px 20px" }}>
            {loading ? "Loading…" : "Search"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: 8, fontSize: 13, color: "#dc2626", marginBottom: 14 }}>
            {error}
          </div>
        )}

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {items.map((it) => {
            const isImage = it.mimeType.startsWith("image/");
            return (
              <div key={it.blobUrl} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ aspectRatio: "4/3", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.blobUrl} alt={it.spFileName || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div style={{ color: "#fff", fontSize: 11, padding: 10, textAlign: "center" }}>
                      {it.mimeType}
                    </div>
                  )}
                </div>
                <div style={{ padding: 8, fontSize: 11, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontWeight: 700, color: "#111", wordBreak: "break-all", lineHeight: 1.3 }}>
                    {it.spFileName || it.blobUrl.split("/").pop()}
                  </div>
                  <div style={{ color: "#6b7280" }}>{it.spFolderPath || "—"}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: "auto", paddingTop: 4 }}>
                    <button onClick={() => copy(it.blobUrl)}
                      style={{ flex: 1, padding: "5px 8px", background: copied === it.blobUrl ? "#10b981" : "#111827", color: "#fff", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {copied === it.blobUrl ? "Copied ✓" : "Copy URL"}
                    </button>
                    {it.spWebUrl && (
                      <a href={it.spWebUrl} target="_blank" rel="noopener noreferrer"
                        style={{ padding: "5px 8px", background: "#fff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                        SP ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {items.length === 0 && !loading && (
          <p style={{ textAlign: "center", color: "#888", padding: 60, fontSize: 13 }}>
            No mirrored media match these filters yet.
          </p>
        )}

        {hasMore && (
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <button onClick={() => fetchPage(true)} disabled={loading}
              style={{ padding: "9px 22px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #ddd",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  background: "#fff",
};
