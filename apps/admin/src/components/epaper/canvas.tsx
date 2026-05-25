"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Moveable from "react-moveable";
import Selecto from "selecto";
import { DEFAULT_GEOMETRY, snapColumn, type PageGeometry } from "@/lib/epaper/geometry";

// v2 editor Canvas (#125). Absolute-mm-positioned blocks rendered inside a
// 330×520mm live area. Moveable wraps the active selection (drag + resize
// corner handles, no rotation). Selecto wraps the canvas for marquee +
// shift-click multi-select.
//
// Y + H stay free in mm; X + W column-snap (#128 wires the snap math).
// Position label + rulers + zoom land in their own components.

export interface Block {
  id: string;
  type: string;
  x: number; y: number; w: number; h: number;
  articleId?: string;
  adAssetId?: string;
  overrideTitle?: string;
  overrideDek?: string;
  locked?: boolean;
  isOverride?: boolean;
  isMaster?: boolean;
  style?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface CanvasProps {
  blocks: Block[];
  geometry?: PageGeometry;
  selectedBlockIds: Set<string>;
  scale?: number;                       // px per mm (default ~3 for 1000px-wide canvas)
  onSelect: (ids: string[], shift: boolean) => void;
  onLayoutChange: (newBlocks: Block[]) => void;
  renderBlockContent: (b: Block) => React.ReactNode;
  /** Right-click a master block → fire this to copy it to the page layer
   *  (#141). When omitted, the canvas just shows the master-block menu hint. */
  onDetachMaster?: (block: Block) => void;
}

export function Canvas({
  blocks,
  geometry = DEFAULT_GEOMETRY,
  selectedBlockIds,
  scale = 3,
  onSelect,
  onLayoutChange,
  renderBlockContent,
  onDetachMaster,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const selectoRef = useRef<Selecto | null>(null);
  const [movableTargets, setMovableTargets] = useState<HTMLElement[]>([]);
  const [altHeld, setAltHeld] = useState(false);
  const [activeLabel, setActiveLabel] = useState<{ id: string; text: string } | null>(null);

  // mm → px scale for on-screen rendering
  const mm = (v: number) => v * scale;

  // Track Alt key globally — held = snap bypass.
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Alt") setAltHeld(true); };
    const up = (e: KeyboardEvent) => { if (e.key === "Alt") setAltHeld(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => setAltHeld(false));
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Resolve which DOM elements correspond to the selected block ids whenever
  // selection changes; Moveable needs real DOM targets.
  useEffect(() => {
    if (!canvasRef.current) return;
    const els: HTMLElement[] = [];
    selectedBlockIds.forEach((id) => {
      const el = canvasRef.current!.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
      if (el) els.push(el);
    });
    setMovableTargets(els);
  }, [selectedBlockIds, blocks]);

  // Selecto for marquee + click-select on canvas background
  useEffect(() => {
    if (!canvasRef.current) return;
    const selecto = new Selecto({
      container: canvasRef.current,
      selectableTargets: ['[data-block-id]'],
      selectByClick: false,
      selectFromInside: false,
      continueSelect: false,
      toggleContinueSelect: ["shift"],
      hitRate: 0,
    });
    selecto.on("select", (e: any) => {
      const ids = e.selected.map((el: HTMLElement) => el.getAttribute("data-block-id")).filter(Boolean);
      onSelect(ids, false);
    });
    selectoRef.current = selecto;
    return () => { selecto.destroy(); selectoRef.current = null; };
  }, [onSelect]);

  // Commit drag/resize back to layout state
  const commitChange = (id: string, mut: Partial<Pick<Block, "x" | "y" | "w" | "h">>) => {
    const next = blocks.map((b) => (b.id === id ? { ...b, ...mut } : b));
    onLayoutChange(next);
  };

  const blocksById = useMemo(() => {
    const m = new Map<string, Block>();
    for (const b of blocks) m.set(b.id, b);
    return m;
  }, [blocks]);

  return (
    <div
      ref={canvasRef}
      className="re-canvas-mm"
      style={{
        position: "relative",
        width: mm(geometry.live.w),
        height: mm(geometry.live.h),
        background: "#fff",
        border: "1px solid #16a34a",
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        userSelect: "none",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect([], false);
      }}
    >
      {/* Column-guide overlay (cyan vertical lines + dim gutter bands). */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        {Array.from({ length: geometry.cols + 1 }, (_, i) => {
          const left_mm = i * (geometry.colWidth + geometry.gutter);
          if (i === geometry.cols) {
            const live_right = geometry.live.w;
            return (
              <div key={`col-edge-${i}`} style={{ position: "absolute", left: mm(live_right) - 1, top: 0, bottom: 0, width: 1, background: "rgba(6,182,212,0.45)" }} />
            );
          }
          return (
            <div key={`col-${i}`}>
              <div style={{ position: "absolute", left: mm(left_mm), top: 0, bottom: 0, width: 1, background: "rgba(6,182,212,0.45)" }} />
              {i < geometry.cols && (
                <div style={{ position: "absolute", left: mm(left_mm + geometry.colWidth), top: 0, bottom: 0, width: mm(geometry.gutter), background: "rgba(6,182,212,0.06)" }} />
              )}
            </div>
          );
        })}
        {/* Alt-bypass HUD: tells operator snap is off while held. */}
        {altHeld && (
          <div style={{ position: "absolute", top: 4, right: 4, padding: "2px 8px", background: "#f59e0b", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 3, letterSpacing: 0.5 }}>
            ⌥ ALT — SNAP OFF
          </div>
        )}
        {/* Live position/size label during active drag/resize. */}
        {activeLabel && (
          <div style={{ position: "absolute", top: 4, left: 4, padding: "2px 8px", background: "#4f46e5", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 3, fontFamily: "monospace" }}>
            {activeLabel.text}
          </div>
        )}
      </div>
      {blocks.map((b) => {
        const isSelected = selectedBlockIds.has(b.id);
        const isMaster = !!b.isMaster;
        // Per-type color so overlapping blocks stay visually distinct (the
        // original single-pink-for-empty made layered tiles look like one
        // big slab covering the whole page).
        const typeColor: Record<string, { bg: string; border: string }> = {
          masthead:       { bg: "#7c2d12", border: "#9a3412" },
          "section-band": { bg: "#991b1b", border: "#b91c1c" },
          lead:           { bg: "#bfdbfe", border: "#3b82f6" },
          major:          { bg: "#c7d2fe", border: "#6366f1" },
          secondary:      { bg: "#ddd6fe", border: "#8b5cf6" },
          brief:          { bg: "#fed7aa", border: "#f97316" },
          image:          { bg: "#bbf7d0", border: "#22c55e" },
          ad:             { bg: "repeating-linear-gradient(45deg,#fafaf6,#fafaf6 6px,#e5e7eb 6px,#e5e7eb 12px)", border: "#9ca3af" },
          text:           { bg: "#fef9c3", border: "#eab308" },
          folio:          { bg: "#f3f4f6", border: "#9ca3af" },
          "story-jump":   { bg: "#fff7ed", border: "#fb923c" },
          "pull-quote":   { bg: "#fce7f3", border: "#ec4899" },
        };
        const t = typeColor[b.type] ?? { bg: "#fee2e2", border: "#f87171" };
        return (
          <div
            key={b.id}
            data-block-id={b.id}
            style={{
              position: "absolute",
              left: mm(b.x),
              top: mm(b.y),
              width: mm(b.w),
              height: mm(b.h),
              background: isMaster ? "rgba(99,102,241,0.10)" : t.bg,
              // Always 2px solid border so overlapping tiles stay visually
              // separable; selection bumps to indigo, master uses dashed purple.
              border: isMaster
                ? "2px dashed #6366f1"
                : isSelected
                ? "3px solid #4f46e5"
                : `2px solid ${t.border}`,
              boxShadow: isSelected ? "0 0 0 4px rgba(79,70,229,0.15)" : "inset 0 0 0 1px rgba(255,255,255,0.4)",
              cursor: isMaster ? "not-allowed" : "grab",
              overflow: "hidden",
              padding: 4,
              fontSize: 11,
              color: ["masthead", "section-band"].includes(b.type) ? "#fff" : "#111",
              opacity: isMaster ? 0.55 : 1,
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (isMaster) return;
              onSelect([b.id], e.shiftKey);
            }}
            onContextMenu={(e) => {
              if (!isMaster || !onDetachMaster) return;
              e.preventDefault();
              if (confirm(`Detach this ${b.type} block from the master? It becomes editable on this page only — the master is unchanged.`)) {
                onDetachMaster(b);
              }
            }}
            title={isMaster ? "Master block (inherited). Right-click → Detach to override on this page." : undefined}
          >
            {renderBlockContent(b)}
          </div>
        );
      })}

      {movableTargets.length > 0 && (
        <Moveable
          target={movableTargets}
          draggable
          resizable
          throttleDrag={0}
          throttleResize={0}
          renderDirections={["nw", "ne", "sw", "se"]}
          edge={false}
          onDragEnd={(e) => {
            setActiveLabel(null);
            const id = (e.target as HTMLElement).getAttribute("data-block-id");
            if (!id) return;
            const current = blocksById.get(id);
            if (!current) return;
            const newX = current.x + (e.lastEvent?.beforeTranslate?.[0] ?? 0) / scale;
            const newY = current.y + (e.lastEvent?.beforeTranslate?.[1] ?? 0) / scale;
            // Column-snap on X (Y free). Alt held = bypass snap entirely.
            const next = altHeld
              ? { x: Math.round(newX * 10) / 10, y: Math.max(0, Math.round(newY * 10) / 10) }
              : (() => {
                  const s = snapColumn(newX, current.w, geometry);
                  return { x: s.x, y: Math.max(0, Math.round(newY * 10) / 10) };
                })();
            commitChange(id, next);
          }}
          onResizeEnd={(e) => {
            setActiveLabel(null);
            const id = (e.target as HTMLElement).getAttribute("data-block-id");
            if (!id) return;
            const current = blocksById.get(id);
            if (!current) return;
            const w_px = e.lastEvent?.width ?? mm(current.w);
            const h_px = e.lastEvent?.height ?? mm(current.h);
            const newW = w_px / scale;
            const newH = h_px / scale;
            const next = altHeld
              ? { x: current.x, w: Math.round(newW * 10) / 10, h: Math.max(geometry.baseline, Math.round(newH * 10) / 10) }
              : (() => {
                  const s = snapColumn(current.x, newW, geometry);
                  return { x: s.x, w: s.w, h: Math.max(geometry.baseline, Math.round(newH * 10) / 10) };
                })();
            commitChange(id, next);
          }}
          onDrag={(e) => {
            e.target.style.transform = e.transform;
            const id = (e.target as HTMLElement).getAttribute("data-block-id");
            const current = id ? blocksById.get(id) : null;
            if (id && current) {
              const dx = (e.beforeTranslate?.[0] ?? 0) / scale;
              const dy = (e.beforeTranslate?.[1] ?? 0) / scale;
              const liveX = current.x + dx;
              const liveY = current.y + dy;
              const colIdx = Math.round(liveX / (geometry.colWidth + geometry.gutter));
              setActiveLabel({ id, text: `${altHeld ? "free" : `col ${colIdx}`} · x:${liveX.toFixed(1)}mm  y:${liveY.toFixed(1)}mm` });
            }
          }}
          onResize={(e) => {
            e.target.style.width = `${e.width}px`;
            e.target.style.height = `${e.height}px`;
            e.target.style.transform = e.drag.transform;
            const id = (e.target as HTMLElement).getAttribute("data-block-id");
            if (id) {
              const w_mm = e.width / scale;
              const h_mm = e.height / scale;
              const span = Math.max(1, Math.round((w_mm + geometry.gutter) / (geometry.colWidth + geometry.gutter)));
              setActiveLabel({ id, text: `${altHeld ? "free" : `${span} col`} · w:${w_mm.toFixed(1)}mm  h:${h_mm.toFixed(1)}mm` });
            }
          }}
        />
      )}
    </div>
  );
}
