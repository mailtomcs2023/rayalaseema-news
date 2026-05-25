// /content/new — type-picker (Spec #1 #116). Picks a ContentType, POSTs a
// minimal draft to /api/content, then redirects to /content/[id] (built in F1).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";

// One tile per ContentType. Color matches the type badge on the list page so
// the journey from list -> picker -> editor stays visually coherent.
const TYPES = [
  {
    type: "ARTICLE",
    icon: "📝",
    title: "Article",
    desc: "Long-form text with rich editor. Default newsroom output.",
    bg: "#fee2e2", fg: "#991b1b",
  },
  {
    type: "VIDEO",
    icon: "📹",
    title: "Video",
    desc: "YouTube / hosted video URL with thumbnail.",
    bg: "#dbeafe", fg: "#1e40af",
  },
  {
    type: "REEL",
    icon: "🎬",
    title: "Reel",
    desc: "Short vertical clip (9:16).",
    bg: "#dcfce7", fg: "#166534",
  },
  {
    type: "WEB_STORY",
    icon: "📖",
    title: "Web Story",
    desc: "Swipeable image-and-caption cards.",
    bg: "#fef3c7", fg: "#92400e",
  },
  {
    type: "PHOTO_GALLERY",
    icon: "📷",
    title: "Photo Gallery",
    desc: "Multi-photo collection with per-photo captions.",
    bg: "#f3e8ff", fg: "#6b21a8",
  },
  {
    type: "CARTOON",
    icon: "🎨",
    title: "Cartoon",
    desc: "Single image with caption + publish date (ఎట్టెట).",
    bg: "#fce7f3", fg: "#9d174d",
  },
  {
    type: "BREAKING_NEWS",
    icon: "⚡",
    title: "Breaking News",
    desc: "Ticker headline. No body, no public URL. Routes straight to review.",
    bg: "#fef2f2", fg: "#7f1d1d",
  },
] as const;

export default function NewContentPage() {
  const router = useRouter();
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState("");

  const pick = async (type: string) => {
    setPicking(type);
    setError("");
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Slug omitted on purpose. BREAKING_NEWS doesn't need one; the others
        // pick it up in the editor (F1) where the user actually writes the title.
        // For now we send a placeholder title so the create succeeds and the
        // editor can rename.
        body: JSON.stringify({
          type,
          title: type === "BREAKING_NEWS" ? "Untitled breaking news" : "Untitled",
          slug: type === "BREAKING_NEWS"
            ? `breaking-${Date.now()}`
            : `untitled-${Date.now()}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Create failed (HTTP ${res.status})`);
        setPicking(null);
        return;
      }
      const row = await res.json();
      router.push(`/content/${row.id}`);
    } catch (e: any) {
      setError(e.message || "Create failed");
      setPicking(null);
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
        <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>Pick a content type. You can change category, status, and details next.</p>

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
            const isPicking = picking === t.type;
            const disabled = picking !== null;
            return (
              <button
                key={t.type}
                onClick={() => pick(t.type)}
                disabled={disabled}
                style={{
                  textAlign: "left",
                  padding: 20,
                  background: "#fff",
                  border: `2px solid ${isPicking ? t.fg : "#e5e7eb"}`,
                  borderRadius: 12,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled && !isPicking ? 0.5 : 1,
                  transition: "border-color 0.15s, transform 0.05s",
                }}
                onMouseEnter={(e) => { if (!disabled) (e.currentTarget.style.borderColor = t.fg); }}
                onMouseLeave={(e) => { if (!isPicking) (e.currentTarget.style.borderColor = "#e5e7eb"); }}
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
                  {t.desc}
                </p>
                {isPicking && (
                  <p style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: t.fg }}>
                    Creating draft…
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
