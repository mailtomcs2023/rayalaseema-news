// Image-search modal for the content editor. Two-tab UI: Pexels (default,
// CC-licensed for commercial use) and Google (wider catalog but copyright
// risk - surfaced with a warning banner). Hits a single /api/images/search
// endpoint and returns the picked URL via onPick.
"use client";

import { useState } from "react";
import { WithTooltip } from "@/components/ui/tooltip";

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

type Provider = "pexels" | "google" | "ai";

export function ImageSearchModal({ open, initialQuery = "", onClose, onPick }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [provider, setProvider] = useState<Provider>("pexels");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState<string | null>(null);
  // AI generation produces ONE image per call (vs N from search providers).
  // generatedUrl holds the most recent generation so user can use or regenerate.
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [aiSize, setAiSize] = useState<"1792x1024" | "1024x1024" | "1024x1792">("1792x1024");

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

  const switchProvider = (p: Provider) => {
    setProvider(p);
    setError("");
    if (p === "ai") {
      // AI doesn't search - user types a prompt + clicks Generate. Clear
      // any prior search hits so the UI doesn't show stale results.
      setHits([]);
      return;
    }
    if (query.trim()) run(query, p as "pexels" | "google");
  };

  // AI image generation. ~5-10s per call, ~$0.04 per 1024x1024 image on
  // gpt-image-2. Output is already EXIF-stripped + RE-stamped + Blob-hosted
  // by the route - we just receive a clean URL.
  const generateAi = async () => {
    if (!query.trim() || generating) return;
    setGenerating(true);
    setError("");
    setGeneratedUrl(null);
    try {
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: query.trim(), size: aiSize }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || `Generation failed (${res.status})`);
      } else {
        setGeneratedUrl(data.url);
      }
    } catch (e: any) {
      setError(e.message || "Generation failed");
    }
    setGenerating(false);
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
            Pexels - free for commercial use
          </button>
          <button onClick={() => switchProvider("google")} style={tab(provider === "google")}>
            Google - ⚠ copyright unknown
          </button>
          <button onClick={() => switchProvider("ai")} style={tab(provider === "ai")}>
            ✨ Generate (AI) - gpt-image-2
          </button>
        </div>

        {/* search row */}
        <div style={{ padding: "10px 16px", display: "flex", gap: 8, borderBottom: "1px solid #e5e7eb", flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (provider === "ai") generateAi();
              else run(query, provider as "pexels" | "google");
            }}
            placeholder={provider === "ai"
              ? "Describe the image - e.g. 'pawan kalyan at a rally in vijayawada, photojournalism style'"
              : "Search keyword (English) - e.g. hyderabad water supply"}
            style={{ flex: 1, minWidth: 200, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14 }}
            autoFocus
          />
          {provider === "ai" && (
            <select value={aiSize} onChange={(e) => setAiSize(e.target.value as any)}
              disabled={generating}
              style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12 }}
              title="Output aspect ratio">
              <option value="1792x1024">16:9 landscape</option>
              <option value="1024x1024">1:1 square</option>
              <option value="1024x1792">9:16 portrait</option>
            </select>
          )}
          {provider === "ai" ? (
            <button
              onClick={generateAi}
              disabled={generating || !query.trim()}
              style={{
                padding: "8px 16px", background: "#7c3aed", color: "#fff", border: "none",
                borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: generating || !query.trim() ? "not-allowed" : "pointer",
                opacity: generating || !query.trim() ? 0.5 : 1,
              }}>
              {generating ? "Generating… (~10s)" : "✨ Generate"}
            </button>
          ) : (
            <button
              onClick={() => run(query, provider as "pexels" | "google")}
              disabled={loading || !query.trim()}
              style={{
                padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none",
                borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: loading || !query.trim() ? "not-allowed" : "pointer",
                opacity: loading || !query.trim() ? 0.5 : 1,
              }}>
              {loading ? "Searching…" : "Search"}
            </button>
          )}
        </div>

        {provider === "ai" && (
          <div style={{ padding: "8px 16px", background: "#ede9fe", borderBottom: "1px solid #ddd6fe", color: "#5b21b6", fontSize: 12 }}>
            ✨ AI-generated images via Azure OpenAI gpt-image-2. ~10s per
            image, ~$0.04 cost. No copyright issue (your generation, your
            usage). Output is photojournalism-style by default. Be specific
            in the prompt for best results.
          </div>
        )}

        {provider === "google" && (
          <div style={{ padding: "8px 16px", background: "#fef3c7", borderBottom: "1px solid #fde68a", color: "#92400e", fontSize: 12 }}>
            ⚠ Google results are mostly copyrighted. Verify the source page's licence before publishing - using a copyrighted image without permission can trigger DMCA takedowns.
          </div>
        )}

        {error && (
          <div style={{ padding: "10px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#dc2626", fontSize: 13 }}>
            {error}
            {error.toLowerCase().includes("not configured") && (
              <span> - set <code>{provider === "google" ? "GOOGLE_CSE_KEY + GOOGLE_CSE_ID" : "PEXELS_API_KEY"}</code> in the admin app env.</span>
            )}
          </div>
        )}

        {/* results grid (search providers) or single-image preview (AI) */}
        <div style={{ flex: 1, overflow: "auto", padding: 12, background: "#f9fafb" }}>
          {provider === "ai" && (
            <>
              {!generatedUrl && !generating && !error && (
                <p style={{ textAlign: "center", color: "#888", padding: 40, fontSize: 13 }}>
                  Type a prompt above and press <b>Generate</b>. Be specific
                  - include subject, setting, mood, and style.
                </p>
              )}
              {generating && (
                <p style={{ textAlign: "center", color: "#7c3aed", padding: 40, fontSize: 13 }}>
                  ✨ Generating… typically 8-15 seconds.
                </p>
              )}
              {generatedUrl && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={generatedUrl} alt="Generated"
                    style={{ maxWidth: "100%", maxHeight: 480, borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => { onPick(generatedUrl); onClose(); }}
                      style={{ padding: "8px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      ✓ Use this image
                    </button>
                    <button
                      onClick={generateAi}
                      disabled={generating}
                      style={{ padding: "8px 18px", background: "#fff", color: "#7c3aed", border: "1px solid #c4b5fd", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: generating ? "not-allowed" : "pointer" }}>
                      ⟳ Regenerate (~$0.04)
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: "#6b7280", textAlign: "center", maxWidth: 600 }}>
                    Tip: tweak the prompt + click Regenerate. Each generation
                    costs ~$0.04. Image is already RE-stamped + Blob-hosted.
                  </p>
                </div>
              )}
            </>
          )}

          {provider !== "ai" && hits.length === 0 && !loading && !error && (
            <p style={{ textAlign: "center", color: "#888", padding: 40, fontSize: 13 }}>
              Type a search above and press Enter.
            </p>
          )}
          {provider !== "ai" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
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
                  <WithTooltip text={h.license}>
                    <div style={{ marginTop: 2 }}>{h.license.slice(0, 30)}…</div>
                  </WithTooltip>
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
          </div>}
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
