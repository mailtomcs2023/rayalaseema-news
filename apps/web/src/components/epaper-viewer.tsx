"use client";

import { useState, useRef, useEffect } from "react";
import { articleHref } from "@/lib/article-href";

interface Hotspot { slug: string; href?: string; x: number; y: number; w: number; h: number; }
interface EpaperPage {
  pageNumber: number;
  label: string;
  imageUrl: string;
  hotspots: Hotspot[];
}

/**
 * Vibrant e-paper viewer. Mirrors the Eenadu reader experience:
 *  - Horizontal thumbnail strip across the top with PAGE# + LABEL on every tile
 *  - Big arrow buttons flanking the page stage for one-click forward/back
 *  - Toolbar with edition/date already handled by the page; viewer keeps clip+zoom
 *  - Click anywhere on the page image to advance (newspaper-like turn)
 *  - Clickable story hotspots layer (transparent until hovered)
 *  - Drag-to-clip + share modal preserved from v1
 */
export function EpaperViewer({
  pages, pdfUrl, dateLabel, editionId,
}: {
  pages: EpaperPage[];
  pdfUrl: string | null;
  dateLabel: string;
  editionId?: string;     // when present, viewer pings /api/epaper/track on every page view
}) {
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [clipMode, setClipMode] = useState(false);
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipBusy, setClipBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ startDist: number; startZoom: number } | null>(null);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Touch pinch-to-zoom. Panning is handled natively by the stage's
  // overflow:auto once the page is wider than the viewport, so we only need to
  // intercept two-finger gestures and feed them into the same `zoom` state the
  // toolbar buttons use. Listeners are non-passive so we can preventDefault and
  // stop the browser zooming the whole page instead of the e-paper page.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) { pinch.current = { startDist: dist(e.touches), startZoom: zoomRef.current }; e.preventDefault(); }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch.current) {
        const ratio = dist(e.touches) / pinch.current.startDist;
        setZoom(Math.max(1, Math.min(4, +(pinch.current.startZoom * ratio).toFixed(2))));
        e.preventDefault();
      }
    };
    const onEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch.current = null; };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMove); el.removeEventListener("touchend", onEnd); };
  }, []);

  // Analytics ping - fire when the current page changes. Fire-and-forget;
  // never blocks UI.
  useEffect(() => {
    if (!editionId || !pages[idx]) return;
    fetch("/api/epaper/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editionId, pageNumber: pages[idx].pageNumber }),
      keepalive: true,
    }).catch(() => {});
  }, [idx, editionId, pages]);

  if (!pages.length) return <div className="ev-empty">ఈ తేదీకి ఎడిషన్ లేదు.</div>;

  const cur = pages[idx];
  const go = (n: number) => {
    setIdx(Math.max(0, Math.min(pages.length - 1, n)));
    setZoom(1); setSel(null); setClipUrl(null);
  };

  const imgRect = () => imgRef.current?.getBoundingClientRect();

  const onDown = (e: React.MouseEvent) => {
    if (!clipMode) return;
    const r = imgRect(); if (!r) return;
    dragStart.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    setSel({ x: dragStart.current.x, y: dragStart.current.y, w: 0, h: 0 });
    setClipUrl(null);
  };
  const onMove = (e: React.MouseEvent) => {
    if (!clipMode || !dragStart.current) return;
    const r = imgRect(); if (!r) return;
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    setSel({
      x: Math.min(dragStart.current.x, cx),
      y: Math.min(dragStart.current.y, cy),
      w: Math.abs(cx - dragStart.current.x),
      h: Math.abs(cy - dragStart.current.y),
    });
  };
  const onUp = async () => {
    if (!clipMode || !dragStart.current) return;
    dragStart.current = null;
    if (!sel || sel.w < 20 || sel.h < 20) { setSel(null); return; }
    await doClip(sel);
  };

  const doClip = async (s: { x: number; y: number; w: number; h: number }) => {
    const imgEl = imgRef.current; if (!imgEl) return;
    setClipBusy(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = cur.imageUrl;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

      const scale = img.naturalWidth / imgEl.clientWidth;
      const sx = s.x * scale, sy = s.y * scale, sw = s.w * scale, sh = s.h * scale;

      const canvas = document.createElement("canvas");
      canvas.width = sw; canvas.height = sh;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
      const fd = new FormData();
      fd.append("clip", blob, "clip.png");
      const r = await fetch("/api/epaper/clip", { method: "POST", body: fd }).then((x) => x.json());
      if (r.url) setClipUrl(r.url);
    } catch {
      setClipUrl(null);
    } finally {
      setClipBusy(false);
    }
  };

  const shareWA = clipUrl
    ? `https://wa.me/?text=${encodeURIComponent("రాయలసీమ న్యూస్ ఈ-పేపర్: " + clipUrl)}`
    : "#";

  return (
    <div className="ev">
      {/* TOP TOOLBAR */}
      <div className="ev-bar">
        <div className="ev-grp">
          <span className="ev-date">{dateLabel}</span>
        </div>
        <div className="ev-grp ev-nav">
          <button onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous page">‹</button>
          <span className="ev-pageno">పేజీ {idx + 1} / {pages.length}</span>
          <button onClick={() => go(idx + 1)} disabled={idx === pages.length - 1} aria-label="Next page">›</button>
        </div>
        <div className="ev-grp">
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">−</button>
          <span className="ev-z">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in">+</button>
          <button
            className={clipMode ? "ev-clip on" : "ev-clip"}
            onClick={() => { setClipMode(!clipMode); setSel(null); setClipUrl(null); }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, marginInlineEnd: 4, verticalAlign: "-2px" }}>
              <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
            </svg>
            క్లిప్
          </button>
          {pdfUrl && <a className="ev-dl" href={pdfUrl} target="_blank" rel="noopener">PDF ↓</a>}
        </div>
      </div>

      {clipMode && (
        <div className="ev-hint">వార్తపై మౌస్‌తో గీసి ఎంచుకోండి - ఆ భాగం షేర్ చేయడానికి సిద్ధం</div>
      )}

      {/* HORIZONTAL THUMBNAIL STRIP - Eenadu-style, with page number + label */}
      <div className="ev-thumbs-h">
        {pages.map((p, i) => (
          <button key={p.pageNumber} className={`ev-thumb${i === idx ? " active" : ""}`} onClick={() => go(i)}>
            <span className="ev-thumb-no">{String(p.pageNumber).padStart(2, "0")}</span>
            <img src={p.imageUrl} alt={`Page ${p.pageNumber}`} loading="lazy" />
            <span className="ev-thumb-label">{p.label}</span>
          </button>
        ))}
      </div>

      {/* STAGE - big page with side arrow buttons */}
      <div className="ev-stage-wrap">
        <button className="ev-stage-arrow left" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous">‹</button>

        <div className="ev-stage" ref={stageRef}>
          <div
            className="ev-pagewrap"
            style={{ width: `${zoom * 100}%`, cursor: clipMode ? "crosshair" : "default" }}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
          >
            <img ref={imgRef} className="ev-page" src={cur.imageUrl} alt={`${cur.label} - page ${cur.pageNumber}`} draggable={false} />

            {!clipMode &&
              cur.hotspots.map((h, i) => (
                <a key={i} className="ev-hotspot" href={h.href || articleHref(h)}
                  onClick={() => {
                    if (editionId) {
                      fetch("/api/epaper/track", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ editionId, pageNumber: cur.pageNumber, articleSlug: h.slug }),
                        keepalive: true,
                      }).catch(() => {});
                    }
                  }}
                  style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, width: `${h.w * 100}%`, height: `${h.h * 100}%` }}
                  title="పూర్తి వార్త చదవండి" />
              ))}

            {clipMode && sel && (
              <div className="ev-sel" style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }} />
            )}
          </div>
        </div>

        <button className="ev-stage-arrow right" onClick={() => go(idx + 1)} disabled={idx === pages.length - 1} aria-label="Next">›</button>
      </div>

      {(clipBusy || clipUrl) && (
        <div className="ev-modal" onClick={() => { if (!clipBusy) { setClipUrl(null); setSel(null); } }}>
          <div className="ev-modal-card" onClick={(e) => e.stopPropagation()}>
            {clipBusy && <div className="ev-modal-busy">క్లిప్ తయారవుతోంది…</div>}
            {clipUrl && (
              <>
                <div className="ev-modal-title">మీ క్లిప్ సిద్ధం</div>
                <img src={clipUrl} alt="clip" className="ev-clip-prev" />
                <div className="ev-clip-actions">
                  <a href={shareWA} target="_blank" rel="noopener" className="ev-wa">WhatsApp షేర్</a>
                  <button onClick={() => { navigator.clipboard.writeText(clipUrl); }} className="ev-copy">లింక్ కాపీ</button>
                  <a href={clipUrl} download="clip.png" className="ev-copy">డౌన్‌లోడ్</a>
                  <button onClick={() => { setClipUrl(null); setSel(null); }} className="ev-close">మూసివేయి</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        .ev { background: #f4f4f5; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .ev-empty {
          background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 8px;
          padding: 60px; text-align: center;
          font-family: var(--font-telugu-body), sans-serif; color: #6b7280;
        }

        /* TOP TOOLBAR */
        .ev-bar {
          display: flex; align-items: center; justify-content: space-between;
          background: linear-gradient(180deg, #B91414 0%, #9c0f0f 100%);
          color: #fff; padding: 10px 16px; gap: 12px; flex-wrap: wrap;
        }
        .ev-grp { display: flex; align-items: center; gap: 8px; }
        .ev-nav { background: rgba(0,0,0,0.18); border-radius: 6px; padding: 2px 6px; }
        .ev-date { font-family: var(--font-telugu-heading), serif; font-size: 15px; font-weight: 800; }
        .ev-pageno { font-family: var(--font-telugu-body), sans-serif; font-size: 13px; font-weight: 700; min-width: 90px; text-align: center; }
        .ev-bar button, .ev-dl, .ev-clip {
          background: rgba(255,255,255,0.16); color: #fff; border: none;
          height: 32px; min-width: 32px; padding: 0 11px; border-radius: 4px; cursor: pointer;
          font-size: 15px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-telugu-body), sans-serif; text-decoration: none;
          transition: background 0.15s;
        }
        .ev-bar button:disabled { opacity: 0.4; cursor: default; }
        .ev-bar button:hover:not(:disabled), .ev-dl:hover { background: rgba(255,255,255,0.32); }
        .ev-clip.on { background: #FFD400; color: #B91414; }
        .ev-z { font-size: 12px; min-width: 42px; text-align: center; font-weight: 700; }

        .ev-hint {
          background: #FFD400; color: #15110c; font-family: var(--font-telugu-body), sans-serif;
          font-size: 13px; font-weight: 700; padding: 7px 14px; text-align: center;
        }

        /* HORIZONTAL THUMBNAIL STRIP */
        .ev-thumbs-h {
          display: flex; gap: 8px; padding: 12px 14px;
          background: #fff; border-bottom: 1px solid rgba(0,0,0,0.06);
          overflow-x: auto; overflow-y: hidden; scrollbar-width: thin;
        }
        .ev-thumbs-h::-webkit-scrollbar { height: 6px; }
        .ev-thumbs-h::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.25); border-radius: 3px; }
        .ev-thumb {
          position: relative; flex: 0 0 88px; border: 2px solid transparent;
          border-radius: 6px; padding: 0; cursor: pointer; background: #f3f4f6;
          overflow: hidden; display: flex; flex-direction: column;
          transition: border-color 0.15s, transform 0.15s;
        }
        .ev-thumb:hover { transform: translateY(-1px); }
        .ev-thumb.active { border-color: #E01B1B; box-shadow: 0 0 0 2px rgba(224,27,27,0.18); }
        .ev-thumb img {
          width: 100%; aspect-ratio: 1/1.6; object-fit: cover; display: block; background: #eee;
        }
        .ev-thumb-no {
          position: absolute; top: 3px; left: 3px;
          background: rgba(224,27,27,0.95); color: #fff;
          font-family: var(--font-telugu-body), sans-serif; font-size: 11px; font-weight: 800;
          padding: 2px 7px; border-radius: 3px; line-height: 1;
        }
        .ev-thumb-label {
          padding: 5px 4px;
          font-family: var(--font-telugu-body), sans-serif; font-size: 10px; font-weight: 700;
          color: #374151; text-align: center;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* STAGE */
        .ev-stage-wrap { position: relative; }
        .ev-stage {
          background: #2a2a2a; padding: 28px 12px; overflow: auto;
          display: flex; justify-content: center; align-items: flex-start;
          max-height: 78vh;
          /* Allow native one-finger pan/scroll; two-finger pinch is handled in JS. */
          touch-action: pan-x pan-y;
        }
        .ev-pagewrap { position: relative; user-select: none; max-width: 1000px; }
        .ev-page { width: 100%; height: auto; display: block; box-shadow: 0 8px 30px rgba(0,0,0,0.5); background: #fff; }
        .ev-hotspot {
          position: absolute; display: block;
          background: rgba(0,120,255,0); transition: background 0.15s;
          -webkit-tap-highlight-color: rgba(0,120,255,0.25);
        }
        .ev-hotspot:hover { background: rgba(0,120,255,0.16); outline: 1px solid rgba(0,120,255,0.6); }
        .ev-hotspot:active { background: rgba(0,120,255,0.22); }
        /* On touch devices (no hover) make tappable stories faintly visible so
           readers know where to tap, the way Eenadu/Sakshi hint article zones. */
        @media (hover: none) {
          .ev-hotspot { background: rgba(0,120,255,0.05); outline: 1px solid rgba(0,120,255,0.18); }
        }
        .ev-sel {
          position: absolute; border: 2px dashed #FFD400;
          background: rgba(255,212,0,0.18); pointer-events: none;
        }

        /* SIDE NAV ARROWS */
        .ev-stage-arrow {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 48px; height: 48px; border-radius: 50%;
          background: rgba(255,255,255,0.94); color: #B91414;
          border: none; font-size: 32px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.35);
          z-index: 5; transition: background 0.15s, transform 0.15s;
          line-height: 1;
        }
        .ev-stage-arrow:hover:not(:disabled) { background: #fff; transform: translateY(-50%) scale(1.08); }
        .ev-stage-arrow:disabled { opacity: 0.3; cursor: default; }
        .ev-stage-arrow.left { left: 16px; }
        .ev-stage-arrow.right { right: 16px; }

        /* MODAL */
        .ev-modal {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.78);
          display: flex; align-items: center; justify-content: center; padding: 20px;
        }
        .ev-modal-card {
          background: #fff; border-radius: 10px; padding: 22px;
          max-width: 560px; width: 100%; text-align: center;
          max-height: 90vh; overflow: auto;
        }
        .ev-modal-busy { font-family: var(--font-telugu-body), sans-serif; font-size: 15px; color: #374151; padding: 30px; }
        .ev-modal-title { font-family: var(--font-telugu-heading), serif; font-size: 18px; font-weight: 800; color: #15110b; margin-bottom: 14px; }
        .ev-clip-prev { max-width: 100%; max-height: 50vh; border: 2px solid #d1d5db; border-radius: 4px; display: block; margin: 0 auto 16px; }
        .ev-clip-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
        .ev-wa, .ev-copy, .ev-close { font-family: var(--font-telugu-body), sans-serif; font-size: 13px; font-weight: 700; padding: 9px 16px; border-radius: 6px; cursor: pointer; text-decoration: none; border: none; }
        .ev-wa { background: #25D366; color: #fff; }
        .ev-copy { background: #374151; color: #fff; }
        .ev-close { background: #e5e7eb; color: #374151; }

        @media (max-width: 768px) {
          .ev-thumb { flex: 0 0 64px; }
          .ev-stage { padding: 14px 6px; max-height: 70vh; }
          .ev-stage-arrow { width: 38px; height: 38px; font-size: 24px; }
          .ev-stage-arrow.left { left: 6px; }
          .ev-stage-arrow.right { right: 6px; }
        }
      `}</style>
    </div>
  );
}
