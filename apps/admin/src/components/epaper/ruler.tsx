"use client";

// mm rulers (#130) for the v2 ePaper editor Canvas.
//
// <Ruler axis="horizontal"> renders a top ruler 0..live.w mm with ticks
// every 10mm + labels every 50mm. <Ruler axis="vertical"> renders left.
// Both honor scale (px per mm). Cursor + selection bounding box rendered
// as marker bands so the operator can read exact positions while dragging.

import { useEffect, useState } from "react";
import { DEFAULT_GEOMETRY, type PageGeometry } from "@/lib/epaper/geometry";

export interface RulerProps {
  axis: "horizontal" | "vertical";
  geometry?: PageGeometry;
  scale: number;
  /** Selected-block bounding box (mm) for the orange selection band. */
  selectionRange?: { start: number; end: number };
  /** Live cursor position in mm - typically lifted from Canvas onMouseMove. */
  cursorMm?: number;
}

const RULER_SIZE = 20; // px

export function Ruler({ axis, geometry = DEFAULT_GEOMETRY, scale, selectionRange, cursorMm }: RulerProps) {
  const isH = axis === "horizontal";
  const totalMm = isH ? geometry.live.w : geometry.live.h;
  const totalPx = totalMm * scale;

  const ticks: Array<{ mm: number; major: boolean }> = [];
  for (let mm = 0; mm <= totalMm; mm += 10) {
    ticks.push({ mm, major: mm % 50 === 0 });
  }

  return (
    <div
      style={{
        position: "relative",
        background: "#1f2937",
        color: "#cbd5e1",
        fontFamily: "monospace",
        fontSize: 9,
        userSelect: "none",
        ...(isH
          ? { width: totalPx, height: RULER_SIZE, borderBottom: "1px solid #111" }
          : { height: totalPx, width: RULER_SIZE, borderRight: "1px solid #111" }),
      }}
    >
      {ticks.map(({ mm, major }) => {
        const offset = mm * scale;
        return (
          <div key={mm}>
            <div
              style={
                isH
                  ? {
                      position: "absolute",
                      left: offset,
                      bottom: 0,
                      width: 1,
                      height: major ? 8 : 4,
                      background: "#94a3b8",
                    }
                  : {
                      position: "absolute",
                      top: offset,
                      right: 0,
                      height: 1,
                      width: major ? 8 : 4,
                      background: "#94a3b8",
                    }
              }
            />
            {major && (
              <div
                style={
                  isH
                    ? { position: "absolute", left: offset + 2, top: 2, color: "#cbd5e1" }
                    : {
                        position: "absolute",
                        top: offset + 2,
                        left: 2,
                        color: "#cbd5e1",
                        transform: "rotate(-90deg)",
                        transformOrigin: "left top",
                      }
                }
              >
                {mm}
              </div>
            )}
          </div>
        );
      })}

      {selectionRange && (
        <div
          style={
            isH
              ? {
                  position: "absolute",
                  left: selectionRange.start * scale,
                  width: (selectionRange.end - selectionRange.start) * scale,
                  top: 0,
                  bottom: 0,
                  background: "rgba(249,115,22,0.3)",
                  pointerEvents: "none",
                }
              : {
                  position: "absolute",
                  top: selectionRange.start * scale,
                  height: (selectionRange.end - selectionRange.start) * scale,
                  left: 0,
                  right: 0,
                  background: "rgba(249,115,22,0.3)",
                  pointerEvents: "none",
                }
          }
        />
      )}

      {typeof cursorMm === "number" && cursorMm >= 0 && cursorMm <= totalMm && (
        <div
          style={
            isH
              ? {
                  position: "absolute",
                  left: cursorMm * scale - 1,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  background: "#facc15",
                  pointerEvents: "none",
                }
              : {
                  position: "absolute",
                  top: cursorMm * scale - 1,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: "#facc15",
                  pointerEvents: "none",
                }
          }
        />
      )}
    </div>
  );
}

/** Helper hook: tracks cursor mm position relative to a canvas element. */
export function useCanvasCursor(canvasRef: React.RefObject<HTMLElement>, scale: number) {
  const [cursor, setCursor] = useState<{ x?: number; y?: number }>({});
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      setCursor({
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale,
      });
    };
    const onLeave = () => setCursor({});
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [canvasRef, scale]);
  return cursor;
}
