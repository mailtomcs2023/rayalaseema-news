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
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CameraIcon,
  FileTextIcon,
  FilmIcon,
  Loader2Icon,
  PaletteIcon,
  VideoIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { Sidebar } from "@/components/sidebar";

interface TypeMeta {
  type: string;
  Icon: LucideIcon;
  title: string;
  desc: string;
  bg: string;
  fg: string;
  ring: string;
}

const TYPES: readonly TypeMeta[] = [
  { type: "ARTICLE",       Icon: FileTextIcon, title: "Article",       desc: "Long-form text with rich editor. Default newsroom output.",            bg: "#fef2f2", fg: "#991b1b", ring: "#fca5a5" },
  { type: "VIDEO",         Icon: VideoIcon,    title: "Video",         desc: "YouTube or hosted video URL with thumbnail.",                          bg: "#eff6ff", fg: "#1e40af", ring: "#93c5fd" },
  { type: "REEL",          Icon: FilmIcon,     title: "Reel",          desc: "Short vertical clip (9:16).",                                          bg: "#f0fdf4", fg: "#166534", ring: "#86efac" },
  { type: "WEB_STORY",     Icon: BookOpenIcon, title: "Web Story",     desc: "Swipeable image-and-caption cards.",                                   bg: "#fffbeb", fg: "#92400e", ring: "#fcd34d" },
  { type: "PHOTO_GALLERY", Icon: CameraIcon,   title: "Photo Gallery", desc: "Multi-photo collection with per-photo captions.",                      bg: "#faf5ff", fg: "#6b21a8", ring: "#d8b4fe" },
  { type: "CARTOON",       Icon: PaletteIcon,  title: "Cartoon",       desc: "Single image with caption and publish date (ఎట్టెట).",               bg: "#fdf2f8", fg: "#9d174d", ring: "#f9a8d4" },
  { type: "BREAKING_NEWS", Icon: ZapIcon,      title: "Breaking News", desc: "Ticker headline. No body, no public URL. Routes straight to review.", bg: "#fff1f2", fg: "#9f1239", ring: "#fda4af" },
];

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
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1 }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 32px 64px" }}>
          {/* Back link */}
          <Link
            href="/content"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "#64748b",
              textDecoration: "none",
              marginBottom: 28,
              transition: "color 150ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#0f172a")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
          >
            <ArrowLeftIcon aria-hidden="true" size={14} />
            Back to Content
          </Link>

          {/* Heading */}
          <div style={{ marginBottom: 36 }}>
            <h1
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: "#0f172a",
                margin: 0,
                marginBottom: 8,
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }}
            >
              What are you creating?
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "#64748b",
                margin: 0,
                maxWidth: 600,
                lineHeight: 1.55,
              }}
            >
              Pick a content type. Title and everything else go in the editor.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 10,
                padding: "10px 14px",
                marginBottom: 24,
                fontSize: 13,
                color: "#b91c1c",
              }}
            >
              {error}
            </div>
          )}

          {/* Type grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 18,
            }}
          >
            {TYPES.map((t) => {
              const busy = creating === t.type;
              const disabled = creating !== null;
              const Icon = t.Icon;
              return (
                <button
                  key={t.type}
                  onClick={() => create(t.type)}
                  disabled={disabled}
                  aria-busy={busy}
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    textAlign: "left",
                    padding: "22px 20px",
                    background: "#fff",
                    border: `1px solid ${busy ? t.ring : "#e5e7eb"}`,
                    borderRadius: 12,
                    cursor: disabled ? (busy ? "wait" : "not-allowed") : "pointer",
                    opacity: disabled && !busy ? 0.5 : 1,
                    transition:
                      "border-color 150ms, box-shadow 150ms, transform 150ms",
                    boxShadow: busy
                      ? `0 0 0 3px ${t.bg}`
                      : "0 1px 2px rgba(15, 23, 42, 0.04)",
                  }}
                  onMouseEnter={(e) => {
                    if (disabled) return;
                    e.currentTarget.style.borderColor = t.ring;
                    e.currentTarget.style.boxShadow =
                      "0 6px 16px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                    const arrow = e.currentTarget.querySelector<HTMLSpanElement>(
                      "[data-arrow]"
                    );
                    if (arrow) {
                      arrow.style.opacity = "1";
                      arrow.style.transform = "translateX(0)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (busy) return;
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.boxShadow =
                      "0 1px 2px rgba(15, 23, 42, 0.04)";
                    e.currentTarget.style.transform = "translateY(0)";
                    const arrow = e.currentTarget.querySelector<HTMLSpanElement>(
                      "[data-arrow]"
                    );
                    if (arrow) {
                      arrow.style.opacity = "0";
                      arrow.style.transform = "translateX(-4px)";
                    }
                  }}
                >
                  {/* Arrow indicator — fades in on hover */}
                  <span
                    data-arrow
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 20,
                      right: 18,
                      color: "#94a3b8",
                      opacity: 0,
                      transform: "translateX(-4px)",
                      transition: "opacity 150ms, transform 150ms",
                      display: "inline-flex",
                    }}
                  >
                    <ArrowRightIcon size={16} />
                  </span>

                  {/* Icon */}
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: t.bg,
                      color: t.fg,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 14,
                    }}
                  >
                    {busy ? (
                      <Loader2Icon
                        aria-hidden="true"
                        size={20}
                        className="animate-spin"
                      />
                    ) : (
                      <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
                    )}
                  </div>

                  {/* Title */}
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#0f172a",
                      marginBottom: 4,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {t.title}
                  </div>

                  {/* Description */}
                  <p
                    style={{
                      fontSize: 13,
                      color: "#64748b",
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {busy ? "Creating draft…" : t.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
