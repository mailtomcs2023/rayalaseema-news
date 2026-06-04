"use client";

// Instagram/Snapchat-style full-screen story viewer for gallery photos.
// Mounts as a fixed overlay on top of the regular gallery page so the
// page itself stays SEO-indexable (every <img> still renders in the
// server-rendered grid below).
//
// Interactions:
//   - tap right half → next; tap left half → previous
//   - desktop arrow keys ←/→, Escape to close
//   - press-and-hold (or mousedown) pauses the auto-advance; release resumes
//   - swipe down (touch) closes
//   - auto-advance every 5s, fills the progress bar smoothly via CSS
//
// Single-instance pattern: parent passes `open` + `startIndex`. We
// don't lazy-fetch — gallery payloads are tiny.

import { useEffect, useRef, useState } from "react";

interface Photo {
  url: string;
  caption?: string;
}

interface Props {
  open: boolean;
  startIndex?: number;
  photos: Photo[];
  title: string;
  onClose: () => void;
}

const DURATION_MS = 5000;
const TICK_MS = 50;

export function GalleryStoryViewer({ open, startIndex = 0, photos, title, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const lastTickRef = useRef<number>(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Reset to caller's startIndex whenever the viewer is re-opened.
  useEffect(() => {
    if (open) {
      setIndex(startIndex);
      setElapsed(0);
      setPaused(false);
    }
  }, [open, startIndex]);

  // Lock body scroll while open. Restore exact prior overflow on close.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Auto-advance ticker. Drives the progress bar AND fires the page
  // turn at DURATION_MS. Paused state freezes both.
  useEffect(() => {
    if (!open) return;
    lastTickRef.current = Date.now();
    tickerRef.current = setInterval(() => {
      if (paused) { lastTickRef.current = Date.now(); return; }
      const now = Date.now();
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      setElapsed((e) => {
        const next = e + dt;
        if (next >= DURATION_MS) {
          setTimeout(() => goNext(), 0);
          return 0;
        }
        return next;
      });
    }, TICK_MS);
    return () => { if (tickerRef.current) clearInterval(tickerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paused, index]);

  const goNext = () => {
    setElapsed(0);
    setIndex((i) => {
      if (i + 1 >= photos.length) {
        // Last frame → close on the next tick so the user sees the
        // final photo briefly before the overlay drops.
        setTimeout(onClose, 0);
        return i;
      }
      return i + 1;
    });
  };

  const goPrev = () => {
    setElapsed(0);
    setIndex((i) => Math.max(0, i - 1));
  };

  // Keyboard nav. Bound while open. Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { goNext(); }
      else if (e.key === "ArrowLeft") { goPrev(); }
      else if (e.key === "Escape") { onClose(); }
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || photos.length === 0) return null;

  const current = photos[index];

  return (
    <div
      role="dialog"
      aria-label={`${title} - photo ${index + 1} of ${photos.length}`}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#000",
        display: "flex", flexDirection: "column",
        touchAction: "manipulation",
      }}
      onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
      onTouchMove={(e) => {
        // Swipe-down to close. Only triggers when the user has moved
        // 80+ px down — small jitters don't dismiss.
        if (touchStartY.current === null) return;
        const dy = e.touches[0].clientY - touchStartY.current;
        if (dy > 80) { onClose(); touchStartY.current = null; }
      }}
      onTouchEnd={() => { touchStartY.current = null; }}
    >
      {/* Progress bars */}
      <div style={{
        display: "flex", gap: 4, padding: "10px 12px 0",
        position: "relative", zIndex: 2,
      }}>
        {photos.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, background: "rgba(255,255,255,0.32)",
            borderRadius: 999, overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: i < index ? "100%" : i === index ? `${(elapsed / DURATION_MS) * 100}%` : "0%",
              background: "#fff",
              transition: i === index ? "none" : "width 200ms ease",
            }} />
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 12px",
        color: "#fff", fontFamily: "var(--font-telugu-body), sans-serif",
        position: "relative", zIndex: 2,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
            {title}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            {index + 1} / {photos.length}
          </div>
        </div>
        <button
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Resume" : "Pause"}
          style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 999, width: 32, height: 32, color: "#fff", cursor: "pointer", fontSize: 14 }}>
          {paused ? "▶" : "❚❚"}
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 999, width: 32, height: 32, color: "#fff", cursor: "pointer", fontSize: 18 }}>
          ×
        </button>
      </div>

      {/* Photo + tap zones */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {/* Tap zones overlap the photo — left half = prev, right half = next.
            press-and-hold = pause; release = resume. */}
        <button
          onClick={goPrev}
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
          aria-label="Previous photo"
          style={{ position: "absolute", left: 0, top: 0, width: "35%", height: "100%", background: "transparent", border: "none", cursor: "w-resize", zIndex: 1 }}
        />
        <button
          onClick={goNext}
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
          aria-label="Next photo"
          style={{ position: "absolute", right: 0, top: 0, width: "65%", height: "100%", background: "transparent", border: "none", cursor: "e-resize", zIndex: 1 }}
        />

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.caption || `Photo ${index + 1}`}
          loading="eager"
          style={{
            maxWidth: "100%", maxHeight: "100%",
            objectFit: "contain",
            display: "block",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Caption */}
      {current.caption && (
        <div style={{
          padding: "12px 16px 20px",
          color: "#fff",
          fontFamily: "var(--font-telugu-body), sans-serif",
          fontSize: 14, lineHeight: 1.5,
          background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
          position: "relative", zIndex: 2,
        }}>
          {current.caption}
        </div>
      )}
    </div>
  );
}
