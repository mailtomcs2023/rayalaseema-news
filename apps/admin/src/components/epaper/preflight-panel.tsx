"use client";

// PreflightPanel (#139) - side panel that lists every issue from
// /api/epaper/edition/[id]/preflight. Replaces every alert() popup.

import { useEffect, useState } from "react";
import type { PreflightIssue, Severity } from "@/lib/epaper/preflight";

export interface PreflightPanelProps {
  editionId: string | null;
  open: boolean;
  onClose: () => void;
  onFocusBlock?: (pageNumber: number, blockId?: string) => void;
  /** Bumped externally (e.g. after render) to force a re-fetch. */
  reloadKey?: number;
}

const SEVERITY_STYLE: Record<Severity, { color: string; bg: string; label: string }> = {
  blocking: { color: "#fff", bg: "#dc2626", label: "🔴 BLOCKING" },
  warn: { color: "#92400e", bg: "#fef3c7", label: "🟡 WARN" },
  info: { color: "#1e40af", bg: "#dbeafe", label: "🔵 INFO" },
};

export function PreflightPanel({ editionId, open, onClose, onFocusBlock, reloadKey = 0 }: PreflightPanelProps) {
  const [issues, setIssues] = useState<PreflightIssue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !editionId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/epaper/edition/${editionId}/preflight`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setIssues(data.issues || []); })
      .catch(() => { if (!cancelled) setIssues([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, editionId, reloadKey]);

  if (!open) return null;

  // Group by severity then by page for tight scanning.
  const order: Severity[] = ["blocking", "warn", "info"];
  const grouped: Record<Severity, PreflightIssue[]> = { blocking: [], warn: [], info: [] };
  for (const i of issues) grouped[i.severity].push(i);

  return (
    <div
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "100%",
        background: "#fff", borderLeft: "1px solid #e5e7eb",
        boxShadow: "-8px 0 24px rgba(0,0,0,0.08)",
        zIndex: 95, display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #e5e7eb" }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: "#111", flex: 1 }}>
          Preflight {loading ? "…" : `(${issues.length})`}
        </h2>
        <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 18, color: "#6b7280", cursor: "pointer" }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {loading && <p style={{ padding: 12, color: "#6b7280", fontSize: 12 }}>Loading…</p>}
        {!loading && issues.length === 0 && (
          <p style={{ padding: 20, textAlign: "center", color: "#16a34a", fontWeight: 700, fontSize: 13 }}>
            ✓ No issues - ready to publish.
          </p>
        )}
        {order.map((sev) => {
          const list = grouped[sev];
          if (list.length === 0) return null;
          const style = SEVERITY_STYLE[sev];
          return (
            <section key={sev} style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", background: style.bg, color: style.color, borderRadius: 4 }}>
                {style.label} ({list.length})
              </h3>
              <ul style={{ listStyle: "none", padding: 0, marginTop: 4 }}>
                {list.map((i, idx) => (
                  <li key={`${i.pageNumber}-${i.blockId}-${idx}`}
                    onClick={() => onFocusBlock?.(i.pageNumber, i.blockId)}
                    style={{
                      padding: "6px 10px", borderBottom: "1px solid #f3f4f6",
                      cursor: onFocusBlock ? "pointer" : "default", fontSize: 12,
                    }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                      <span style={{ fontWeight: 700, color: "#4f46e5", fontSize: 11 }}>P{i.pageNumber}</span>
                      {i.blockType && <span style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase" }}>{i.blockType}</span>}
                      <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto" }}>{i.kind}</span>
                    </div>
                    <div style={{ color: "#374151", marginTop: 2, lineHeight: 1.4 }}>{i.detail}</div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Toolbar chip that opens the panel + shows live counts. */
export function PreflightChip({
  editionId, onClick, reloadKey = 0,
}: { editionId: string | null; onClick: () => void; reloadKey?: number }) {
  const [counts, setCounts] = useState({ total: 0, blocking: 0 });

  useEffect(() => {
    if (!editionId) return;
    let cancelled = false;
    fetch(`/api/epaper/edition/${editionId}/preflight`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setCounts({ total: data.total ?? 0, blocking: data.blocking ?? 0 }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [editionId, reloadKey]);

  if (counts.total === 0) {
    return (
      <button onClick={onClick}
        style={{ padding: "6px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        ✓ Preflight clean
      </button>
    );
  }
  return (
    <button onClick={onClick}
      title="Open preflight panel"
      style={{ padding: "6px 12px", background: counts.blocking > 0 ? "#dc2626" : "#f59e0b", color: "#fff", border: "none", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
      ⚠ {counts.total} issue{counts.total > 1 ? "s" : ""}{counts.blocking > 0 ? ` (${counts.blocking} blocking)` : ""}
    </button>
  );
}
