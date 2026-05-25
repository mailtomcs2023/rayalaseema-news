"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface Version {
  id: string;
  editNote: string | null;
  editorName: string;
  blockCount: number;
  createdAt: string;
}

export function VersionsClient({
  templateId,
  versions,
}: {
  templateId: string;
  versions: Version[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore(v: Version) {
    if (!confirm(`Restore version from ${new Date(v.createdAt).toLocaleString()} into the current draft? Published layout stays untouched until you publish again.`))
      return;
    setError(null);
    setRestoring(v.id);
    const res = await fetch(
      `/api/page-builder/templates/${templateId}/restore/${v.id}`,
      { method: "POST" },
    );
    setRestoring(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Restore failed");
      return;
    }
    startTransition(() => router.push(`/page-builder/templates/${templateId}`));
  }

  return (
    <div>
      {error && (
        <div
          style={{
            background: "#FEF2F2",
            color: "#B91C1C",
            border: "1px solid #FECACA",
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 10,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb", textAlign: "left" }}>
            <tr>
              <th style={th}>Saved</th>
              <th style={th}>By</th>
              <th style={th}>Blocks</th>
              <th style={th}>Note</th>
              <th style={{ ...th, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {versions.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>
                  No version history yet — publish the draft to capture the first snapshot.
                </td>
              </tr>
            )}
            {versions.map((v) => (
              <tr key={v.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>{new Date(v.createdAt).toLocaleString()}</td>
                <td style={td}>{v.editorName}</td>
                <td style={td}>{v.blockCount}</td>
                <td style={{ ...td, color: v.editNote ? "#111827" : "#9ca3af" }}>
                  {v.editNote || "—"}
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button
                    onClick={() => restore(v)}
                    disabled={busy || restoring === v.id}
                    style={{
                      background: "#FF2C2C",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {restoring === v.id ? "Restoring…" : "Restore to draft"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const td: React.CSSProperties = { padding: "12px", verticalAlign: "middle" };
