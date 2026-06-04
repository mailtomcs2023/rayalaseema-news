"use client";

// Inline magazine-style page-flip viewer for gallery photos.
// Renders ON the gallery page itself (no "open" button needed); a
// small fullscreen toggle in the corner expands the book to a
// full-viewport overlay for immersive reading.
//
// Uses react-pageflip (StPageFlip) mounted via dynamic({ ssr:false })
// — the library measures DOM dimensions on first paint and a server
// render with zero-size wrappers triggered framework-level cascades
// on the previous attempt.

import { useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";

const HTMLFlipBook = dynamic(
  () => import("react-pageflip").then((m) => m.default),
  { ssr: false, loading: () => null },
);

interface Photo {
  url: string;
  caption?: string;
}

interface Props {
  photos: Photo[];
  title: string;
}

interface FlipBookHandle {
  pageFlip: () => {
    flipPrev: () => void;
    flipNext: () => void;
    flip: (page: number) => void;
    getCurrentPageIndex: () => number;
    getPageCount: () => number;
  };
}

export function GalleryFlipbook({ photos, title }: Props) {
  const bookRef = useRef<FlipBookHandle | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState({ w: 480, h: 640 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Recompute book size whenever the surface or window changes.
  // Inline mode: fit inside the gallery main column (max ~600 wide).
  // Fullscreen: viewport minus toolbar + caption padding.
  useEffect(() => {
    const recalc = () => {
      const vw = Math.min(window.innerWidth, 1200);
      const vh = window.innerHeight;
      if (fullscreen) {
        const padX = Math.min(40, vw * 0.06);
        const padY = 110;
        let w = Math.min(vw - padX * 2, 600);
        let h = w * (4 / 3);
        if (h > vh - padY) {
          h = vh - padY;
          w = h * (3 / 4);
        }
        setSize({ w: Math.round(w), h: Math.round(h) });
      } else {
        const containerW = containerRef.current?.clientWidth || 800;
        // Inline: clamp 320-600px width; portrait magazine 3:4 aspect.
        const w = Math.min(Math.max(containerW - 32, 320), 600);
        const h = w * (4 / 3);
        setSize({ w: Math.round(w), h: Math.round(h) });
      }
    };
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [fullscreen]);

  // Lock body scroll only in fullscreen mode.
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [fullscreen]);

  // Keyboard nav active in fullscreen only (inline shares the document
  // with the rest of the page, hijacking arrow keys there would be
  // surprising).
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      const api = bookRef.current?.pageFlip();
      if (!api) return;
      if (e.key === "ArrowRight") api.flipNext();
      else if (e.key === "ArrowLeft") api.flipPrev();
      else if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  if (photos.length === 0) return null;
  const total = photos.length + 1; // +1 for cover

  const bookNode = (
    /* @ts-expect-error react-pageflip typings — className+startPage are
       declared required but library accepts the props as below. */
    <HTMLFlipBook
      className="rsn-flipbook"
      startPage={0}
      width={size.w}
      height={size.h}
      size="stretch"
      minWidth={300}
      maxWidth={800}
      minHeight={400}
      maxHeight={1080}
      maxShadowOpacity={0.5}
      showCover={true}
      mobileScrollSupport={true}
      flippingTime={650}
      usePortrait={true}
      startZIndex={0}
      autoSize={true}
      clickEventForward={false}
      drawShadow={true}
      useMouseEvents={true}
      swipeDistance={30}
      showPageCorners={true}
      disableFlipByClick={false}
      ref={bookRef as unknown as never}
      onFlip={(e: { data: number }) => setPage(e.data)}
      style={{ background: "transparent" }}
    >
      {/* Cover page */}
      <div style={pageStyle} key="cover">
        <div style={{
          width: "100%", height: "100%",
          background: "linear-gradient(135deg, #E01B1B 0%, #8E0F0F 100%)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: 24, color: "#fff", textAlign: "center",
          fontFamily: "var(--font-telugu-heading), serif",
        }}>
          <div style={{ fontSize: 11, opacity: 0.85, letterSpacing: 2, marginBottom: 14 }}>రాయలసీమ న్యూస్</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.3, marginBottom: 18 }}>{title}</h2>
          <div style={{ fontSize: 13, opacity: 0.9 }}>{photos.length} photos</div>
          <div style={{
            marginTop: 28,
            padding: "8px 16px",
            border: "1px solid rgba(255,255,255,0.45)",
            borderRadius: 999,
            fontSize: 11, letterSpacing: 1,
            fontFamily: "var(--font-telugu-body), sans-serif",
          }}>
            పేజీ తిప్పండి
          </div>
        </div>
      </div>

      {/* One page per photo */}
      {photos.map((photo, i) => (
        <div style={pageStyle} key={`p-${i}`}>
          <div style={{
            width: "100%", height: "100%", background: "#0a0a0a",
            display: "flex", flexDirection: "column",
            position: "relative",
          }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.caption || `Photo ${i + 1}`}
                loading={i < 3 ? "eager" : "lazy"}
                style={{
                  maxWidth: "100%", maxHeight: "100%",
                  objectFit: "contain",
                  display: "block",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              />
            </div>
            {photo.caption && (
              <div style={{
                padding: "10px 14px",
                color: "#fff",
                fontFamily: "var(--font-telugu-body), sans-serif",
                fontSize: 12, lineHeight: 1.5,
                background: "rgba(0,0,0,0.78)",
              }}>
                {photo.caption}
              </div>
            )}
            <div style={{
              position: "absolute", bottom: 6, right: 10,
              color: "rgba(255,255,255,0.55)", fontSize: 10,
              fontFamily: "var(--font-telugu-body), sans-serif",
            }}>
              {i + 1} / {photos.length}
            </div>
          </div>
        </div>
      ))}
    </HTMLFlipBook>
  );

  // INLINE rendering — fits inside the gallery page column.
  if (!fullscreen) {
    return (
      <div
        ref={containerRef}
        style={{
          marginTop: 8, marginBottom: 24,
          background: "linear-gradient(180deg, #f5f3ee 0%, #ece8df 100%)",
          borderRadius: 12,
          padding: "24px 16px",
          position: "relative",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}
      >
        {bookNode}
        <div style={{
          display: "flex", alignItems: "center", gap: 14, marginTop: 14,
          fontFamily: "var(--font-telugu-body), sans-serif",
          fontSize: 12, color: "#374151",
        }}>
          <button
            onClick={() => bookRef.current?.pageFlip()?.flipPrev()}
            aria-label="Previous page"
            style={inlineToolbarBtn}>
            ‹ ముందుపేజీ
          </button>
          <span style={{ minWidth: 70, textAlign: "center", fontWeight: 700, color: "#111" }}>
            {Math.min(page + 1, total)} / {total}
          </span>
          <button
            onClick={() => bookRef.current?.pageFlip()?.flipNext()}
            aria-label="Next page"
            style={inlineToolbarBtn}>
            తదుపరి ›
          </button>
          <button
            onClick={() => setFullscreen(true)}
            aria-label="Fullscreen"
            title="Fullscreen"
            style={{ ...inlineToolbarBtn, background: "#E01B1B", color: "#fff", border: "none" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 6 }}>
              <polyline points="15 3 21 3 21 9"/>
              <polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/>
              <line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
            పూర్తి స్క్రీన్
          </button>
        </div>
      </div>
    );
  }

  // FULLSCREEN overlay.
  return (
    <div
      role="dialog"
      aria-label={`${title} flipbook`}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(10,10,10,0.96)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px",
        color: "#fff",
        zIndex: 2,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)",
      }}>
        <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-telugu-body), sans-serif" }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {title}
          </div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            {Math.min(page + 1, total)} / {total}
          </div>
        </div>
        <button
          onClick={() => bookRef.current?.pageFlip()?.flipPrev()}
          aria-label="Previous page"
          style={overlayToolbarBtn}>‹</button>
        <button
          onClick={() => bookRef.current?.pageFlip()?.flipNext()}
          aria-label="Next page"
          style={overlayToolbarBtn}>›</button>
        <button
          onClick={() => setFullscreen(false)}
          aria-label="Exit fullscreen"
          style={overlayToolbarBtn}>×</button>
      </div>
      {bookNode}
    </div>
  );
}

const inlineToolbarBtn: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #d1d5db",
  borderRadius: 999,
  color: "#111",
  padding: "7px 14px",
  fontSize: 12, fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex", alignItems: "center",
};

const overlayToolbarBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.15)",
  border: "none",
  borderRadius: 999,
  color: "#fff",
  width: 36, height: 36,
  fontSize: 18,
  cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};

// Each child of HTMLFlipBook must be a single DOM element with a
// defined size — StPageFlip queries getBoundingClientRect on every
// page during init. Anything that collapses to 0×0 (a Fragment, a
// purely-styled span, or a flex child with no flex-basis) triggers
// the "function is not a function" cascade.
const pageStyle: React.CSSProperties = {
  width: "100%", height: "100%",
  background: "#fff",
  overflow: "hidden",
};
