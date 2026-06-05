"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirm } from "@/components/confirm-dialog";

interface Row {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  note: string | null;
  createdAt: string;
}

export function RedirectsClient({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const add = async () => {
    if (!from.trim() || !to.trim()) {
      toast.error("From and target are both required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/redirects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromPath: from.trim(), toPath: to.trim(), note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to add redirect");
        return;
      }
      setRows((r) => [data, ...r.filter((x) => x.fromPath !== data.fromPath)]);
      setFrom("");
      setTo("");
      setNote("");
      toast.success("Redirect saved");
      startTransition(() => router.refresh());
    } catch (e: any) {
      toast.error(e.message || "Failed to add redirect");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    const ok = await confirm({
      title: "Delete this redirect?",
      description: `${row.fromPath} → ${row.toPath}`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/redirects/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    setRows((r) => r.filter((x) => x.id !== row.id));
    toast.success("Redirect deleted");
  };

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", margin: 0 }}>Redirects</h1>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 20px" }}>
        Site-wide 301/308 redirects. Use these when a page&apos;s URL changes (or you want a custom/short
        path) so the old/new URL never 404s - e.g. <code>/ananthapuram</code> → <code>/ananthapuramu</code>.
        Changes go live within a minute.
      </p>

      {/* Add form */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          flexWrap: "wrap",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 14,
          marginBottom: 20,
        }}
      >
        <div style={{ flex: "1 1 200px" }}>
          <label style={lab}>From (old / custom path)</label>
          <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="/ananthapuram" />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label style={lab}>To (real path)</label>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="/ananthapuramu" />
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label style={lab}>Note (optional)</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="reason" />
        </div>
        <Button onClick={add} disabled={saving}>
          {saving ? "Saving…" : "Add redirect"}
        </Button>
      </div>

      {/* List */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        {rows.length === 0 ? (
          <p style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No redirects yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", textAlign: "left", color: "#6b7280" }}>
                <th style={th}>From</th>
                <th style={th}>To</th>
                <th style={th}>Code</th>
                <th style={th}>Note</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f1f1f4" }}>
                  <td style={td}>
                    <code>{r.fromPath}</code>
                  </td>
                  <td style={td}>
                    <code>{r.toPath}</code>
                  </td>
                  <td style={td}>{r.statusCode}</td>
                  <td style={{ ...td, color: "#6b7280" }}>{r.note || "-"}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(r)}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const lab: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 };
const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 12px" };
