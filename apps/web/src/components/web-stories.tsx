"use client";

import { useState, useEffect, useCallback } from "react";
import { SectionShell } from "./section-shell";

// All data comes from DB via props - no hardcoded content

// Fullscreen story viewer
function StoryViewer({ story, onClose, onNext, onPrev, index, total }: {
  story: { id: string; title: string; image: string; category: string };
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  index: number;
  total: number;
}) {
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  // Auto-advance
  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) { onNext(); return 0; }
        return p + 1.5;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [paused, onNext]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.93)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {/* Close */}
      <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, color: "#fff", zIndex: 10, background: "none", border: "none", cursor: "pointer" }}>
        <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      {/* Left arrow */}
      {index > 0 && (
        <button onClick={onPrev} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="24" height="24" fill="none" stroke="#fff" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}

      {/* Story card */}
      <div style={{ width: "min(400px, 90vw)", height: "min(680px, 85vh)", borderRadius: 12, overflow: "hidden", position: "relative", background: "#000" }}>
        {/* Progress bars */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, display: "flex", gap: 3, padding: "8px 8px 0" }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.3)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "#fff", borderRadius: 2, width: i < index ? "100%" : i === index ? `${progress}%` : "0%", transition: i === index ? "width 100ms linear" : "none" }} />
            </div>
          ))}
        </div>

        {/* Logo */}
        <div style={{ position: "absolute", top: 20, left: 12, zIndex: 20 }}>
          <img src="/logo.png" alt="RE" style={{ height: 18, filter: "brightness(0) invert(1)", opacity: 0.8 }} />
        </div>

        {/* Pause */}
        <button
          onClick={() => setPaused(!paused)}
          style={{ position: "absolute", top: 20, right: 12, zIndex: 20, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.8)" }}
        >
          {paused ? (
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          ) : (
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          )}
        </button>

        {/* Image */}
        <img src={story.image} alt={story.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%, rgba(0,0,0,0.3) 100%)" }} />

        {/* Content */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, zIndex: 10 }}>
          <span style={{ display: "inline-block", padding: "3px 10px", background: "#E01B1B", borderRadius: 3, color: "#fff", marginBottom: 8, fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {story.category}
          </span>
          <h3 style={{ fontFamily: "var(--font-telugu-heading), serif", fontWeight: 800, fontSize: 20, lineHeight: 1.35, color: "#fff", textShadow: "1px 1px 4px rgba(0,0,0,0.8)" }}>
            {story.title}
          </h3>
        </div>

        {/* Tap areas */}
        <button onClick={onPrev} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "33%", zIndex: 15, background: "none", border: "none", cursor: "pointer" }} />
        <button onClick={onNext} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "33%", zIndex: 15, background: "none", border: "none", cursor: "pointer" }} />
      </div>

      {/* Right arrow */}
      <button onClick={onNext} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="24" height="24" fill="none" stroke="#fff" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  );
}

export function WebStories({ items }: { items: { id: string; title: string; image: string; category: string }[] }) {
  const storyItems = items;
  if (!storyItems || storyItems.length === 0) return null;
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openStory = (i: number) => { setViewerIndex(i); setViewerOpen(true); };
  const closeStory = () => setViewerOpen(false);
  const nextStory = () => {
    if (viewerIndex < storyItems.length - 1) setViewerIndex(viewerIndex + 1);
    else closeStory();
  };
  const prevStory = () => { if (viewerIndex > 0) setViewerIndex(viewerIndex - 1); };

  return (
    <>
      <SectionShell
        title="వెబ్ స్టోరీస్"
        count={`${storyItems.length} స్టోరీస్`}
        moreHref="/stories"
        moreLabel="అన్ని స్టోరీలు చూడండి"
      >
        {/* Story grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
          {storyItems.slice(0, 12).map((story, i) => (
            <button
              key={story.id}
              onClick={() => openStory(i)}
              style={{
                position: "relative", overflow: "hidden", borderRadius: 6,
                padding: 0, cursor: "pointer", background: "#000", textAlign: "left",
              }}
              className="group"
            >
              <div style={{ aspectRatio: "3/5", overflow: "hidden" }}>
                <img
                  src={story.image}
                  alt={story.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  loading="lazy"
                />
              </div>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 48%)" }} />
              <span
                style={{
                  position: "absolute", top: 7, left: 7,
                  fontFamily: "var(--font-telugu-body), sans-serif",
                  fontSize: 9, fontWeight: 800, color: "#fff",
                  background: "#E01B1B", padding: "2px 7px", borderRadius: 2,
                  textTransform: "uppercase", letterSpacing: "0.04em",
                }}
              >
                {story.category}
              </span>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px 8px 10px" }}>
                <p
                  style={{
                    fontFamily: "var(--font-telugu-heading), serif",
                    fontSize: 13, fontWeight: 700, lineHeight: 1.35, color: "#fff",
                    textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                  }}
                >
                  {story.title}
                </p>
              </div>
            </button>
          ))}
        </div>
      </SectionShell>

      {/* Fullscreen viewer */}
      {viewerOpen && (
        <StoryViewer
          story={storyItems[viewerIndex]}
          onClose={closeStory}
          onNext={nextStory}
          onPrev={prevStory}
          index={viewerIndex}
          total={storyItems.length}
        />
      )}
    </>
  );
}
