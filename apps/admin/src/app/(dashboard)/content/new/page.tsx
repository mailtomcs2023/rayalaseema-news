// /content/new — type-picker (Spec #1 #116). One click on a tile creates
// a minimal draft with placeholder title "Untitled <type>" and redirects to
// /content/[id]. The editor's title input is the next thing the user sees,
// so a separate step here was redundant.
//
// Double-click guard: the `creating` ref short-circuits any second click
// before the redirect finishes, so we still produce one draft per intent
// (the old bug was 5 drafts from a few rapid clicks).
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";

const TYPES = [
  { type: "ARTICLE",       icon: "📝", title: "Article",       desc: "Long-form text with rich editor. Default newsroom output.",      bg: "#fee2e2", fg: "#991b1b" },
  { type: "VIDEO",         icon: "📹", title: "Video",         desc: "YouTube / hosted video URL with thumbnail.",                     bg: "#dbeafe", fg: "#1e40af" },
  { type: "REEL",          icon: "🎬", title: "Reel",          desc: "Short vertical clip (9:16).",                                    bg: "#dcfce7", fg: "#166534" },
  { type: "WEB_STORY",     icon: "📖", title: "Web Story",     desc: "Swipeable image-and-caption cards.",                             bg: "#fef3c7", fg: "#92400e" },
  { type: "PHOTO_GALLERY", icon: "📷", title: "Photo Gallery", desc: "Multi-photo collection with per-photo captions.",                bg: "#f3e8ff", fg: "#6b21a8" },
  { type: "CARTOON",       icon: "🎨", title: "Cartoon",       desc: "Single image with caption + publish date (ఎట్టెట).",            bg: "#fce7f3", fg: "#9d174d" },
  { type: "BREAKING_NEWS", icon: "⚡", title: "Breaking News", desc: "Ticker headline. No body, no public URL. Routes straight to review.", bg: "#fef2f2", fg: "#7f1d1d" },
] as const;

export default function NewContentPage() {
  const router = useRouter();
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inflight = useRef(false);

  const create = async (chosenType: string) => {
    if (inflight.current) return;
    inflight.current = true;
    setCreating(chosenType);
    setError("");
    try {
      const meta = TYPES.find((t) => t.type === chosenType);
      const placeholderTitle = `Untitled ${meta?.title || chosenType}`;
      const ts = Date.now();
      const slug = chosenType === "BREAKING_NEWS" ? `breaking-${ts}` : `untitled-${ts}`;
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: chosenType, title: placeholderTitle, slug }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Create failed (HTTP ${res.status})`);
        inflight.current = false;
        setCreating(null);
        return;
      }
      const row = await res.json();
      router.push(`/content/${row.id}`);
    } catch (e: any) {
      setError(e.message || "Create failed");
      inflight.current = false;
      setCreating(null);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Link href="/content" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>← Back to Content</Link>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111", marginBottom: 4 }}>What are you creating?</h1>
        <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>
          Pick a content type. Title + everything else go in the editor.
        </p>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>
            {error}
          </div>
        )}

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12,
        }}>
          {TYPES.map((t) => {
            const busy = creating === t.type;
            const disabled = creating !== null;
            return (
              <button
                key={t.type}
                onClick={() => create(t.type)}
                disabled={disabled}
                style={{
                  textAlign: "left",
                  padding: 20,
                  background: "#fff",
                  border: `2px solid ${busy ? t.fg : "#e5e7eb"}`,
                  borderRadius: 12,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled && !busy ? 0.5 : 1,
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => { if (!disabled) (e.currentTarget.style.borderColor = t.fg); }}
                onMouseLeave={(e) => { if (!busy) (e.currentTarget.style.borderColor = "#e5e7eb"); }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 10,
                  background: t.bg, color: t.fg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 24, marginBottom: 12,
                }}>{t.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 4 }}>
                  {t.title}
                </div>
                <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5, margin: 0 }}>
                  {busy ? "Creating draft…" : t.desc}
                </p>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
