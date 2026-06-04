"use client";

// Magazine-style page-flip viewer for gallery photos.
// Uses react-pageflip (StPageFlip) with a true 3D page-turn animation.
// Each photo is a single page; cover page renders the gallery title +
// photo count + cover image.
//
// Mounted with ssr:false via dynamic import to avoid the hydration
// mismatch the previous attempt hit — StPageFlip measures DOM dims on
// mount and a server-rendered shell with zero-size wrappers would
// trigger framework-level "function is not a function" cascades.

import { useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";

// react-pageflip's exported component. Loading lazily keeps the
// flipbook out of the page's initial bundle so casual viewers who
// don't open it pay zero JS cost.
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
  open: boolean;
  onClose: () => void;
}

interface FlipBookHandle {
  pageFlip: () => {
    flipPrev: () => void;
    flipNext: () => void;
    getCurrentPageIndex: () => number;
    getPageCount: () => number;
  };
}

export function GalleryFlipbook({ photos, title, open, onClose }: Props) {
  const bookRef = useRef<FlipBookHandle | null>(null);
  const [size, setSize] = useState({ w: 480, h: 640 });
  const [page, setPage] = useState(0);

  // Compute book size — responsive to the viewport. Cap at 600×800 on
  // desktop, full viewport minus padding on mobile.
  useEffect(() => {
    if (!open) return;
    const recalc = () => {
      const vw = Math.min(window.innerWidth, 1200);
      const vh = window.innerHeight;
      // Aim for portrait magazine aspect 3:4. Cap by both dimensions.
      const padX = Math.min(40, vw * 0.06);
      const padY = 110; // toolbar + caption
      let w = Math.min(vw - padX * 2, 560);
      let h = w * (4 / 3);
      if (h > vh - padY) {
        h = vh - padY;
        w = h * (3 / 4);
      }
      setSize({ w: Math.round(w), h: Math.round(h) });
    };
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [open]);

  // Body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Keyboard nav: ←/→ flip, Escape close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const api = bookRef.current?.pageFlip();
      if (!api) return;
      if (e.key === "ArrowRight") api.flipNext();
      else if (e.key === "ArrowLeft") api.flipPrev();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || photos.length === 0) return null;

  const total = photos.length + 1; // +1 for cover

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
      {/* Top toolbar */}
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
          style={toolbarBtn}>‹</button>
        <button
          onClick={() => bookRef.current?.pageFlip()?.flipNext()}
          aria-label="Next page"
          style={toolbarBtn}>›</button>
        <button onClick={onClose} aria-label="Close" style={toolbarBtn}>×</button>
      </div>

      {/* The flipbook itself. Children are pages — each must be a DOM
        element StPageFlip can measure. */}
      <HTMLFlipBook
        className="gallery-flipbook"
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
            <div style={{ fontSize: 12, opacity: 0.8, letterSpacing: 2, marginBottom: 14 }}>రాయలసీమ న్యూస్</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.3, marginBottom: 18 }}>{title}</h2>
            <div style={{ fontSize: 13, opacity: 0.9 }}>{photos.length} photos</div>
            <div style={{
              marginTop: 28,
              padding: "8px 16px",
              border: "1px solid rgba(255,255,255,0.4)",
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
    </div>
  );
}

const toolbarBtn: React.CSSProperties = {
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
// the "function is not a function" cascade we hit on the previous
// attempt. Keep this style on every page wrapper.
const pageStyle: React.CSSProperties = {
  width: "100%", height: "100%",
  background: "#fff",
  overflow: "hidden",
};
