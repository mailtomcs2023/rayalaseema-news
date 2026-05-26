// Image-search modal for the content editor. Two-tab UI: Pexels (default,
// CC-licensed for commercial use) and Google (wider catalog but copyright
// risk — surfaced with a warning banner). Hits a single /api/images/search
// endpoint and returns the picked URL via onPick.
"use client";

import { useState } from "react";

interface Hit {
  thumbUrl: string;
  fullUrl: string;
  sourceUrl: string | null;
  photographer: string | null;
  license: string;
}

interface Props {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onPick: (url: string) => void;
}

export function ImageSearchModal({ open, initialQuery = "", onClose, onPick }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [provider, setProvider] = useState<"pexels" | "google">("pexels");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState<string | null>(null);

  if (!open) return null;

  const run = async (q: string, p: "pexels" | "google") => {
    if (!q.trim()) return;
    setLoading(true);
    setError("");
    setHits([]);
    try {
      const res = await fetch(`/api/images/search?provider=${p}&q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `Search failed (${res.status})`);
      } else {
        setHits(data.results || []);
      }
    } catch (e: any) {
      setError(e.message || "Search failed");
    }
    setLoading(false);
  };

  const switchProvider = (p: "pexels" | "google") => {
    setProvider(p);
    if (query.trim()) run(query, p);
  };

  // Pick = download via the server, strip third-party EXIF (GPS, camera body,
  // original photographer), stamp our own copyright + artist, re-host on
  // Azure Blob, then hand the hosted URL back to the editor. Doing this server
  // side avoids exposing the Pexels CDN / Google image-source domain as the
  // final URL on the public site.
  const pickImage = async (fullUrl: string) => {
    setPicking(fullUrl);
    setError("");
    try {
      const res = await fetch("/api/images/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fullUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || `Process failed (${res.status})`);
        setPicking(null);
        return;
      }
      onPick(data.url);
      onClose();
    } catch (e: any) {
      setError(e.message || "Process failed");
    }
    setPicking(null);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 10, width: "min(960px, 95vw)",
          maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column",
        }}
      >
        {/* header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", flex: 1 }}>Find an image</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 4, padding: "8px 16px", borderBottom: "1px solid #e5e7eb" }}>
          <button onClick={() => switchProvider("pexels")} style={tab(provider === "pexels")}>
            Pexels — free for commercial use
          </button>
          <button onClick={() => switchProvider("google")} style={tab(provider === "google")}>
            Google — ⚠ copyright unknown
          </button>
        </div>

        {/* search row */}
        <div style={{ padding: "10px 16px", display: "flex", gap: 8, borderBottom: "1px solid #e5e7eb" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") run(query, provider); }}
            placeholder="Search keyword (English) — e.g. hyderabad water supply"
            style={{ flex: 1, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
            autoFocus
          />
          <button
            onClick={() => run(query, provider)}
            disabled={loading || !query.trim()}
            style={{
              padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none",
              borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: loading || !query.trim() ? "not-allowed" : "pointer",
              opacity: loading || !query.trim() ? 0.5 : 1,
            }}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {provider === "google" && (
          <div style={{ padding: "8px 16px", background: "#fef3c7", borderBottom: "1px solid #fde68a", color: "#92400e", fontSize: 12 }}>
            ⚠ Google results are mostly copyrighted. Verify the source page's licence before publishing — using a copyrighted image without permission can trigger DMCA takedowns.
          </div>
        )}

        {error && (
          <div style={{ padding: "10px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#dc2626", fontSize: 13 }}>
            {error}
            {error.toLowerCase().includes("not configured") && (
              <span> — set <code>{provider === "google" ? "GOOGLE_CSE_KEY + GOOGLE_CSE_ID" : "PEXELS_API_KEY"}</code> in the admin app env.</span>
            )}
          </div>
        )}

        {/* results grid */}
        <div style={{ flex: 1, overflow: "auto", padding: 12, background: "#f9fafb" }}>
          {hits.length === 0 && !loading && !error && (
            <p style={{ textAlign: "center", color: "#888", padding: 40, fontSize: 13 }}>
              Type a search above and press Enter.
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {hits.map((h, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={h.thumbUrl}
                  alt=""
                  style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
                  loading="lazy"
                />
                <div style={{ padding: 6, fontSize: 11, color: "#6b7280" }}>
                  {h.photographer && <div style={{ fontWeight: 600, color: "#374151" }}>{h.photographer}</div>}
                  <div style={{ marginTop: 2 }} title={h.license}>{h.license.slice(0, 30)}…</div>
                </div>
                <button
                  onClick={() => pickImage(h.fullUrl)}
                  disabled={picking !== null}
                  style={{ width: "100%", padding: "6px 0", background: picking === h.fullUrl ? "#6b7280" : "#dc2626", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: picking ? "not-allowed" : "pointer", opacity: picking && picking !== h.fullUrl ? 0.5 : 1 }}
                >
                  {picking === h.fullUrl ? "Processing…" : "Use this image"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function tab(active: boolean): React.CSSProperties {
  return {
    padding: "6px 14px",
    background: active ? "#111827" : "#fff",
    color: active ? "#fff" : "#374151",
    border: "1px solid #e5e7eb",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}
