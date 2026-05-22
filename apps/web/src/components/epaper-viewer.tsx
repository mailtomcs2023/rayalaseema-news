"use client";

import { useState, useRef } from "react";

interface Hotspot { slug: string; x: number; y: number; w: number; h: number; }
interface EpaperPage {
  pageNumber: number;
  label: string;
  imageUrl: string;
  hotspots: Hotspot[];
}

/** Eenadu-style e-paper viewer — page nav, zoom, clickable story hotspots, clip-to-share. */
export function EpaperViewer({
  pages,
  pdfUrl,
  dateLabel,
}: {
  pages: EpaperPage[];
  pdfUrl: string | null;
  dateLabel: string;
}) {
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [clipMode, setClipMode] = useState(false);
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipBusy, setClipBusy] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  if (!pages.length) return <div className="ev-empty">ఈ తేదీకి ఎడిషన్ లేదు.</div>;

  const cur = pages[idx];
  const go = (n: number) => {
    setIdx(Math.max(0, Math.min(pages.length - 1, n)));
    setZoom(1); setSel(null); setClipUrl(null);
  };

  // ----- clip drag (relative to the image element) -----
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

  // ----- crop the natural-res image + upload -----
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
    ? `https://wa.me/?text=${encodeURIComponent("రాయలసీమ ఎక్స్‌ప్రెస్ ఈ-పేపర్: " + clipUrl)}`
    : "#";

  return (
    <div className="ev">
      <div className="ev-bar">
        <div className="ev-grp">
          <button onClick={() => go(idx - 1)} disabled={idx === 0}>‹</button>
          <select value={idx} onChange={(e) => go(Number(e.target.value))}>
            {pages.map((p, i) => (
              <option key={p.pageNumber} value={i}>పేజీ {p.pageNumber} — {p.label}</option>
            ))}
          </select>
          <button onClick={() => go(idx + 1)} disabled={idx === pages.length - 1}>›</button>
        </div>
        <div className="ev-date">{dateLabel}</div>
        <div className="ev-grp">
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>−</button>
          <span className="ev-z">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>+</button>
          <button
            className={clipMode ? "ev-clip on" : "ev-clip"}
            onClick={() => { setClipMode(!clipMode); setSel(null); setClipUrl(null); }}
          >
            ✂ క్లిప్
          </button>
          {pdfUrl && <a className="ev-dl" href={pdfUrl} target="_blank" rel="noopener">PDF ↓</a>}
        </div>
      </div>

      {clipMode && (
        <div className="ev-hint">✂ వార్తపై మౌస్‌తో గీసి ఎంచుకోండి — ఆ భాగం షేర్ చేయడానికి సిద్ధం</div>
      )}

      <div className="ev-body">
        <div className="ev-thumbs">
          {pages.map((p, i) => (
            <button key={p.pageNumber} className={`ev-thumb${i === idx ? " active" : ""}`} onClick={() => go(i)}>
              <img src={p.imageUrl} alt={`Page ${p.pageNumber}`} loading="lazy" />
              <span>{p.pageNumber}</span>
            </button>
          ))}
        </div>

        <div className="ev-stage" ref={stageRef}>
          <div
            className="ev-pagewrap"
            style={{ width: `${zoom * 100}%`, cursor: clipMode ? "crosshair" : "default" }}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
          >
            <img ref={imgRef} className="ev-page" src={cur.imageUrl} alt={`${cur.label} — page ${cur.pageNumber}`} draggable={false} />

            {/* Clickable story hotspots (off in clip mode) */}
            {!clipMode &&
              cur.hotspots.map((h, i) => (
                <a
                  key={i}
                  className="ev-hotspot"
                  href={`/article/${h.slug}`}
                  style={{
                    left: `${h.x * 100}%`, top: `${h.y * 100}%`,
                    width: `${h.w * 100}%`, height: `${h.h * 100}%`,
                  }}
                  title="పూర్తి వార్త చదవండి"
                />
              ))}

            {/* Clip selection rect */}
            {clipMode && sel && (
              <div
                className="ev-sel"
                style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Clip result — centered modal */}
      {(clipBusy || clipUrl) && (
        <div className="ev-modal" onClick={() => { if (!clipBusy) { setClipUrl(null); setSel(null); } }}>
          <div className="ev-modal-card" onClick={(e) => e.stopPropagation()}>
            {clipBusy && <div className="ev-modal-busy">క్లిప్ తయారవుతోంది…</div>}
            {clipUrl && (
              <>
                <div className="ev-modal-title">✂ మీ క్లిప్ సిద్ధం</div>
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
        .ev { background: #2a2a2a; border-radius: 8px; overflow: hidden; }
        .ev-empty {
          background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 8px;
          padding: 60px; text-align: center;
          font-family: var(--font-telugu-body), sans-serif; color: #6b7280;
        }
        .ev-bar {
          display: flex; align-items: center; justify-content: space-between;
          background: #B91414; color: #fff; padding: 8px 14px; gap: 12px; flex-wrap: wrap;
        }
        .ev-grp { display: flex; align-items: center; gap: 8px; }
        .ev-date { font-family: var(--font-telugu-heading), serif; font-size: 14px; font-weight: 700; }
        .ev-bar button, .ev-dl, .ev-clip {
          background: rgba(255,255,255,0.16); color: #fff; border: none;
          height: 30px; min-width: 30px; padding: 0 10px; border-radius: 4px; cursor: pointer;
          font-size: 14px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-telugu-body), sans-serif; text-decoration: none;
        }
        .ev-bar button:disabled { opacity: 0.35; cursor: default; }
        .ev-bar button:hover:not(:disabled), .ev-dl:hover { background: rgba(255,255,255,0.3); }
        .ev-clip.on { background: #FFD400; color: #B91414; }
        .ev-bar select {
          background: #fff; color: #15110c; border: none; border-radius: 4px;
          padding: 5px 8px; font-family: var(--font-telugu-body), sans-serif; font-size: 12px; max-width: 220px;
        }
        .ev-z { font-size: 12px; min-width: 42px; text-align: center; }
        .ev-hint {
          background: #FFD400; color: #15110c; font-family: var(--font-telugu-body), sans-serif;
          font-size: 13px; font-weight: 700; padding: 6px 14px; text-align: center;
        }

        .ev-body { display: flex; height: 78vh; }
        .ev-thumbs {
          flex: 0 0 110px; overflow-y: auto; background: #1d1d1d;
          padding: 8px; display: flex; flex-direction: column; gap: 8px;
        }
        .ev-thumb {
          position: relative; border: 2px solid transparent; border-radius: 3px;
          padding: 0; cursor: pointer; background: none; overflow: hidden;
        }
        .ev-thumb.active { border-color: #E01B1B; }
        .ev-thumb img { width: 100%; display: block; }
        .ev-thumb span {
          position: absolute; bottom: 2px; right: 3px;
          background: rgba(0,0,0,0.75); color: #fff; font-size: 10px; padding: 0 5px; border-radius: 2px;
        }
        .ev-stage { flex: 1; overflow: auto; padding: 20px; display: flex; justify-content: center; align-items: flex-start; }
        .ev-pagewrap { position: relative; user-select: none; }
        .ev-page { width: 100%; height: auto; display: block; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
        .ev-hotspot {
          position: absolute; display: block;
          background: rgba(0,120,255,0); transition: background 0.15s;
        }
        .ev-hotspot:hover { background: rgba(0,120,255,0.16); outline: 1px solid rgba(0,120,255,0.6); }
        .ev-sel {
          position: absolute; border: 2px dashed #FFD400;
          background: rgba(255,212,0,0.18); pointer-events: none;
        }

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
        .ev-modal-busy {
          font-family: var(--font-telugu-body), sans-serif; font-size: 15px;
          color: #374151; padding: 30px;
        }
        .ev-modal-title {
          font-family: var(--font-telugu-heading), serif; font-size: 18px; font-weight: 800;
          color: #15110b; margin-bottom: 14px;
        }
        .ev-clip-prev {
          max-width: 100%; max-height: 50vh;
          border: 2px solid #d1d5db; border-radius: 4px; display: block; margin: 0 auto 16px;
        }
        .ev-clip-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
        .ev-wa, .ev-copy, .ev-close {
          font-family: var(--font-telugu-body), sans-serif; font-size: 13px; font-weight: 700;
          padding: 9px 16px; border-radius: 6px; cursor: pointer; text-decoration: none; border: none;
        }
        .ev-wa { background: #25D366; color: #fff; }
        .ev-copy { background: #374151; color: #fff; }
        .ev-close { background: #e5e7eb; color: #374151; }

        @media (max-width: 768px) {
          .ev-body { flex-direction: column; height: auto; }
          .ev-thumbs { flex: none; flex-direction: row; overflow-x: auto; width: 100%; height: 88px; }
          .ev-thumb { flex: 0 0 56px; }
          .ev-stage { height: 70vh; }
        }
      `}</style>
    </div>
  );
}
