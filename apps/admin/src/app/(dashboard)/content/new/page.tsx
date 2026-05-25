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
  // Two-step UX: click tile -> reveal title field -> Create button submits.
  // Previously the tile click POSTed directly, which produced one "Untitled
  // DRAFT" row per click — making the list page noisy and confusing.
  const [chosenType, setChosenType] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Slug derived from title (no hyphens for non-ASCII Telugu; falls back to a
  // timestamp so the API doesn't reject empty slugs).
  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").substring(0, 60);

  const create = async () => {
    if (!chosenType) return;
    if (!title.trim()) {
      setError("Title is required before creating.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const cleanTitle = title.trim();
      const baseSlug = slugify(cleanTitle) || `content-${Date.now()}`;
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: chosenType,
          title: cleanTitle,
          slug: chosenType === "BREAKING_NEWS" ? `breaking-${Date.now()}` : `${baseSlug}-${Date.now()}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Create failed (HTTP ${res.status})`);
        setCreating(false);
        return;
      }
      const row = await res.json();
      router.push(`/content/${row.id}`);
    } catch (e: any) {
      setError(e.message || "Create failed");
      setCreating(false);
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
            const isChosen = chosenType === t.type;
            return (
              <button
                key={t.type}
                onClick={() => { setChosenType(t.type); setError(""); }}
                style={{
                  textAlign: "left",
                  padding: 20,
                  background: "#fff",
                  border: `2px solid ${isChosen ? t.fg : "#e5e7eb"}`,
                  borderRadius: 12,
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => { if (!isChosen) (e.currentTarget.style.borderColor = t.fg); }}
                onMouseLeave={(e) => { if (!isChosen) (e.currentTarget.style.borderColor = "#e5e7eb"); }}
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
              </button>
            );
          })}
        </div>

        {/* Title input + Create button — appears once a type is chosen so we
            never write an empty-title draft to the DB. */}
        {chosenType && (
          <div style={{ marginTop: 24, padding: 20, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6 }}>
              Give this {TYPES.find((x) => x.type === chosenType)?.title} a title to create it
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") create(); }}
                placeholder="Headline / title…"
                style={{ flex: 1, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 15, outline: "none" }}
              />
              <button
                onClick={create}
                disabled={creating || !title.trim()}
                style={{ padding: "10px 20px", background: title.trim() ? "#dc2626" : "#9ca3af", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: creating || !title.trim() ? "not-allowed" : "pointer" }}
              >
                {creating ? "Creating…" : "Create + Edit"}
              </button>
              <button
                onClick={() => { setChosenType(null); setTitle(""); setError(""); }}
                style={{ padding: "10px 14px", background: "#f3f4f6", color: "#6b7280", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
