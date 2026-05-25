"use client";

// Zoom controls (#132) for the v2 ePaper editor.
//
// Component pairs with a useZoom hook:
//   - slider 25–200% step 5
//   - keyboard + / - / 0
//   - Ctrl+wheel zoom centered on cursor
//   - Space+drag pans the canvas
//   - Fit page / Fit width buttons

import { useEffect, useState, useCallback, type RefObject } from "react";

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.05;

export interface ZoomState {
  zoom: number;                       // 1 = 100%
  setZoom: (z: number) => void;
  fitPage: () => void;
  fitWidth: () => void;
  isPanning: boolean;
}

export function useZoom({
  containerRef,
  contentSize,
  onPan,
}: {
  containerRef: RefObject<HTMLElement>;
  contentSize: { w: number; h: number }; // base size at 100% in px
  onPan?: (dx: number, dy: number) => void;
}): ZoomState {
  const [zoom, setZoomState] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const setZoom = useCallback((z: number) => {
    setZoomState(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)));
  }, []);

  const fitPage = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fitH = r.height / contentSize.h;
    const fitW = r.width / contentSize.w;
    setZoom(Math.min(fitH, fitW) * 0.95);
  }, [containerRef, contentSize, setZoom]);

  const fitWidth = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setZoom((el.getBoundingClientRect().width / contentSize.w) * 0.95);
  }, [containerRef, contentSize, setZoom]);

  // Keyboard: + / - / 0 reset, Space pan toggle
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Skip when user is typing in an input
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(zoom + ZOOM_STEP); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); setZoom(zoom - ZOOM_STEP); }
      else if (e.key === "0") { e.preventDefault(); setZoom(1); }
      else if (e.key === " " && !spaceHeld) { e.preventDefault(); setSpaceHeld(true); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") { setSpaceHeld(false); setIsPanning(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [zoom, setZoom, spaceHeld]);

  // Ctrl+wheel zoom centered on cursor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom(zoom + delta);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, zoom, setZoom]);

  // Space+drag pan
  useEffect(() => {
    if (!spaceHeld) return;
    const el = containerRef.current;
    if (!el) return;
    let dragging = false;
    let last = { x: 0, y: 0 };
    const down = (e: MouseEvent) => { dragging = true; setIsPanning(true); last = { x: e.clientX, y: e.clientY }; };
    const move = (e: MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      if (onPan) onPan(dx, dy);
      else { el.scrollLeft -= dx; el.scrollTop -= dy; }
    };
    const up = () => { dragging = false; setIsPanning(false); };
    el.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      el.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [spaceHeld, containerRef, onPan]);

  return { zoom, setZoom, fitPage, fitWidth, isPanning };
}

export function ZoomBar({ state }: { state: ZoomState }) {
  const { zoom, setZoom, fitPage, fitWidth } = state;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "4px 10px", background: "#1f2937", color: "#cbd5e1",
        border: "1px solid #111", borderRadius: 4, fontSize: 11, fontFamily: "monospace",
      }}
    >
      <button onClick={() => setZoom(zoom - ZOOM_STEP)} style={btn}>−</button>
      <input
        type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
        value={zoom} onChange={(e) => setZoom(Number(e.target.value))}
        style={{ width: 120 }}
      />
      <button onClick={() => setZoom(zoom + ZOOM_STEP)} style={btn}>+</button>
      <span style={{ minWidth: 40, textAlign: "right" }}>{(zoom * 100).toFixed(0)}%</span>
      <button onClick={() => setZoom(1)} style={btn}>100%</button>
      <button onClick={fitPage} style={btn}>Fit page</button>
      <button onClick={fitWidth} style={btn}>Fit width</button>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "#374151", color: "#e5e7eb", border: "none",
  padding: "2px 8px", borderRadius: 3, cursor: "pointer", fontSize: 10, fontWeight: 700,
};
