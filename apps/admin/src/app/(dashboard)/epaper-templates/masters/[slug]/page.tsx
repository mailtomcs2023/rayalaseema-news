"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ToastViewport, useToasts } from "@/components/toast";
import { confirm } from "@/components/confirm-dialog";
import { EditorV2 } from "@/components/epaper/editor-v2";
import type { Block as CanvasBlock } from "@/components/epaper/canvas";

interface Master {
  id: string; slug: string; name: string;
  version: number;
  layout: { blocks: CanvasBlock[] };
  geometryOverride: unknown;
}

// /epaper-templates/masters/[slug] - master editor route (#143).
//
// Reuses the same Canvas + Rulers + ZoomBar composition as the page editor.
// Save is explicit (no auto-save) - masters affect many editions, so the
// operator confirms before propagation.
export default function MasterEditorPage() {
  const params = useParams();
  const router = useRouter();
  const slug = String((params as Record<string, unknown>).slug ?? "");

  const [master, setMaster] = useState<Master | null>(null);
  const [blocks, setBlocks] = useState<CanvasBlock[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toasts, push: toast, dismiss } = useToasts();

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/epaper/masters/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.master) return;
        setMaster(data.master);
        const initial = (data.master.layout?.blocks || []).map((b: CanvasBlock) => ({ ...b, isMaster: false }));
        setBlocks(initial);
      });
  }, [slug]);

  const usedCount = useMemo(() => 0, []); // TODO: query usage when needed

  const save = async () => {
    if (!master) return;
    if (
      !(await confirm({
        title: `Save changes to '${master.slug}'?`,
        description: "This affects every page that inherits this master on next render.",
        confirmText: "Save changes",
      }))
    )
      return;
    setSaving(true);
    try {
      const r = await fetch(`/api/epaper/masters/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout: { blocks: blocks.map((b) => { const { isMaster: _m, ...rest } = b; return rest; }) },
          expectedVersion: master.version,
        }),
      });
      const data = await r.json();
      if (!r.ok) { toast("error", data.error || "Save failed"); return; }
      setMaster(data.master);
      setDirty(false);
      toast("success", "Master saved + propagated.");
    } finally { setSaving(false); }
  };

  if (!master) return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <main style={{ marginLeft: 240, padding: 24 }}>Loading…</main>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0f172a" }}>
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
      <main style={{ marginLeft: 240, flex: 1, display: "flex", flexDirection: "column", padding: 16, gap: 12, height: "100vh", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#e5e7eb" }}>
          <button onClick={() => router.back()} style={{ background: "transparent", border: "1px solid #374151", color: "#cbd5e1", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>← Back</button>
          <h1 style={{ fontSize: 18, fontWeight: 800 }}>Editing master: <span style={{ color: "#db2777" }}>{master.slug}</span></h1>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>v{master.version}{usedCount > 0 ? ` · used by ${usedCount} template${usedCount > 1 ? "s" : ""}` : ""}</span>
          <span style={{ flex: 1 }} />
          {dirty && <span style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700 }}>● unsaved</span>}
          <button onClick={save} disabled={!dirty || saving}
            style={{ padding: "6px 16px", background: dirty ? "#16a34a" : "#374151", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: dirty ? "pointer" : "not-allowed" }}>
            {saving ? "Saving…" : "Save + propagate"}
          </button>
        </div>

        <EditorV2
          blocks={blocks}
          selectedBlockIds={selectedIds}
          onSelect={(ids, shift) => {
            if (shift) {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                for (const id of ids) { if (next.has(id)) next.delete(id); else next.add(id); }
                return next;
              });
            } else {
              setSelectedIds(new Set(ids));
            }
          }}
          onLayoutChange={(next) => { setBlocks(next); setDirty(true); }}
          renderBlockContent={(b) => (
            <>
              <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, textTransform: "uppercase" }}>{b.type}</div>
              {b.type === "masthead" && <div style={{ fontWeight: 700, marginTop: 3, color: "#A50D0D" }}>రాయలసీమ న్యూస్</div>}
              {b.type === "folio" && <div style={{ fontWeight: 700, marginTop: 3, color: "#111" }}>{`{{pageNumber}} · {{dateLabel}}`}</div>}
              {b.type === "section-band" && <div style={{ fontWeight: 700, marginTop: 3, color: "#A50D0D" }}>{`{{sectionLabel}}`}</div>}
            </>
          )}
        />
      </main>
    </div>
  );
}
