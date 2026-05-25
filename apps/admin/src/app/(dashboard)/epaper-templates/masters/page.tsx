"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";

interface MasterListItem {
  id: string; slug: string; name: string; version: number; updatedAt: string;
}

export default function MastersListPage() {
  const [masters, setMasters] = useState<MasterListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/epaper/masters")
      .then((r) => r.json())
      .then((data) => setMasters(data.masters || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 16 }}>ePaper Masters</h1>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
          Master pages hold repeating elements (masthead, folio, cities band) that propagate across every page inheriting the master. Edit a master once → all editions update on next render.
        </p>
        {loading ? <p style={{ color: "#888" }}>Loading…</p> : (
          <table style={{ width: "100%", background: "#fff", borderRadius: 6, borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f9fafb", textAlign: "left" }}>
              <th style={{ padding: 8 }}>Slug</th>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Version</th>
              <th style={{ padding: 8 }}>Updated</th>
              <th style={{ padding: 8 }}></th>
            </tr></thead>
            <tbody>
              {masters.length === 0 && <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: "#888" }}>No masters yet. Run the seed script.</td></tr>}
              {masters.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: 8, fontFamily: "monospace", color: "#4f46e5" }}>{m.slug}</td>
                  <td style={{ padding: 8, fontWeight: 700 }}>{m.name}</td>
                  <td style={{ padding: 8 }}>v{m.version}</td>
                  <td style={{ padding: 8, color: "#6b7280", fontSize: 11 }}>{new Date(m.updatedAt).toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td style={{ padding: 8 }}>
                    <Link href={`/epaper-templates/masters/${m.slug}`} style={{ padding: "4px 10px", background: "#4f46e5", color: "#fff", borderRadius: 4, fontWeight: 700, fontSize: 11, textDecoration: "none" }}>Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
