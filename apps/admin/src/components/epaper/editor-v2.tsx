"use client";

import { useRef } from "react";
import { Canvas, type Block as CanvasBlock } from "./canvas";
import { Ruler, useCanvasCursor } from "./ruler";
import { useZoom, ZoomBar } from "./zoom-controls";
import { DEFAULT_GEOMETRY, type PageGeometry } from "@/lib/epaper/geometry";

// EditorV2 (#135) — composes Canvas + Rulers + ZoomBar into a single
// drop-in alternative to DraggableBlockGrid. Page (apps/admin/src/app/
// (dashboard)/epaper/page.tsx) renders this when ?editor=v2.

export interface EditorV2Props {
  blocks: CanvasBlock[];
  geometry?: PageGeometry;
  selectedBlockIds: Set<string>;
  onSelect: (ids: string[], shift: boolean) => void;
  onLayoutChange: (next: CanvasBlock[]) => void;
  renderBlockContent: (b: CanvasBlock) => React.ReactNode;
  onDetachMaster?: (block: CanvasBlock) => void;
}

const BASE_SCALE = 3; // px per mm at 100% zoom

export function EditorV2({
  blocks,
  geometry = DEFAULT_GEOMETRY,
  selectedBlockIds,
  onSelect,
  onLayoutChange,
  renderBlockContent,
  onDetachMaster,
}: EditorV2Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const contentSize = {
    w: geometry.live.w * BASE_SCALE,
    h: geometry.live.h * BASE_SCALE,
  };
  const zoom = useZoom({ containerRef: scrollRef as unknown as React.RefObject<HTMLElement>, contentSize });
  const scale = BASE_SCALE * zoom.zoom;

  const cursor = useCanvasCursor(canvasRef as unknown as React.RefObject<HTMLElement>, scale);

  // Selection bounding box for ruler highlight (mm).
  const sel = blocks.find((b) => selectedBlockIds.has(b.id));
  const selH = sel ? { start: sel.x, end: sel.x + sel.w } : undefined;
  const selV = sel ? { start: sel.y, end: sel.y + sel.h } : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "#0f172a", border: "1px solid #111", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: 6, background: "#111827", borderBottom: "1px solid #000" }}>
        <ZoomBar state={zoom} />
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* corner spacer */}
        <div style={{ width: 20, height: 20, background: "#1f2937", borderBottom: "1px solid #111", borderRight: "1px solid #111" }} />
        <div style={{ overflow: "hidden", flex: 1 }}>
          <Ruler axis="horizontal" scale={scale} geometry={geometry} cursorMm={cursor.x} selectionRange={selH} />
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Ruler axis="vertical" scale={scale} geometry={geometry} cursorMm={cursor.y} selectionRange={selV} />
        <div
          ref={scrollRef}
          style={{ flex: 1, overflow: "auto", padding: 16, background: "#374151", cursor: zoom.isPanning ? "grabbing" : undefined }}
        >
          <div ref={canvasRef} style={{ display: "inline-block" }}>
            <Canvas
              blocks={blocks}
              geometry={geometry}
              scale={scale}
              selectedBlockIds={selectedBlockIds}
              onSelect={onSelect}
              onLayoutChange={onLayoutChange}
              renderBlockContent={renderBlockContent}
              onDetachMaster={onDetachMaster}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
