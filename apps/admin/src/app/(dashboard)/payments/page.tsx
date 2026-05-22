"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";

interface PaymentConfig {
  id: string; articleType: string; name: string; nameTE?: string;
  rate: number; minWords: number; requiresImage: boolean; requiresVideo: boolean;
  bonusRate: number; active: boolean;
}

const defaultTypes = [
  { articleType: "text_news", name: "Text News (300+ words)", nameTE: "టెక్స్ట్ వార్త", minWords: 300 },
  { articleType: "photo_news", name: "Photo + News", nameTE: "ఫోటో వార్త", minWords: 200, requiresImage: true },
  { articleType: "video_story", name: "Video Story", nameTE: "వీడియో స్టోరీ", minWords: 100, requiresVideo: true },
  { articleType: "exclusive", name: "Exclusive / Investigation", nameTE: "ఎక్స్‌క్లూసివ్", minWords: 500 },
  { articleType: "breaking", name: "Breaking News", nameTE: "బ్రేకింగ్ న్యూస్", minWords: 50 },
  { articleType: "opinion", name: "Opinion / Column", nameTE: "అభిప్రాయం", minWords: 400 },
];

export default function PaymentsPage() {
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [editing, setEditing] = useState<Record<string, { rate: string; bonusRate: string }>>({});

  useEffect(() => {
    fetch("/api/payment-config").then((r) => r.json()).then(setConfigs);
  }, []);

  const saveRate = async (articleType: string) => {
    const e = editing[articleType];
    if (!e) return;
    const def = defaultTypes.find((d) => d.articleType === articleType);
    await fetch("/api/payment-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleType, rate: parseFloat(e.rate), bonusRate: parseFloat(e.bonusRate || "0"), ...def }),
    });
    const updated = await fetch("/api/payment-config").then((r) => r.json());
    setConfigs(updated);
    setEditing((prev) => { const n = { ...prev }; delete n[articleType]; return n; });
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>Payment Configuration</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>Set per-article rates for journalists. All rates in INR (₹)</p>

        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div className="table-scroll">
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888" }}>Article Type</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888" }}>Telugu</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888" }}>Min Words</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: "#888" }}>Rate (₹)</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: "#888" }}>Bonus/1K views</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: "#888" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {defaultTypes.map((dt) => {
                const config = configs.find((c) => c.articleType === dt.articleType);
                const isEditing = !!editing[dt.articleType];

                return (
                  <tr key={dt.articleType} style={{ borderBottom: "1px solid #f9fafb" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{dt.name}</span>
                      {dt.requiresImage && <span style={{ marginLeft: 6, fontSize: 9, background: "#dbeafe", color: "#1d4ed8", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>📷 Photo</span>}
                      {dt.requiresVideo && <span style={{ marginLeft: 6, fontSize: 9, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>🎥 Video</span>}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#888" }}>{dt.nameTE}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#888" }}>{dt.minWords}+</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {isEditing ? (
                        <input type="number" value={editing[dt.articleType].rate} onChange={(e) => setEditing({ ...editing, [dt.articleType]: { ...editing[dt.articleType], rate: e.target.value } })}
                          style={{ width: 80, padding: "4px 8px", border: "1px solid #ddd", borderRadius: 4, fontSize: 14, textAlign: "right" }} />
                      ) : (
                        <span style={{ fontSize: 16, fontWeight: 800, color: config?.rate ? "#111" : "#ccc" }}>₹{config?.rate || "—"}</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {isEditing ? (
                        <input type="number" value={editing[dt.articleType].bonusRate} onChange={(e) => setEditing({ ...editing, [dt.articleType]: { ...editing[dt.articleType], bonusRate: e.target.value } })}
                          style={{ width: 60, padding: "4px 8px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, textAlign: "right" }} />
                      ) : (
                        <span style={{ fontSize: 13, color: "#888" }}>₹{config?.bonusRate || 0}</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {isEditing ? (
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button onClick={() => saveRate(dt.articleType)} style={{ padding: "4px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Save</button>
                          <button onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[dt.articleType]; return n; })} style={{ padding: "4px 10px", background: "#f3f4f6", color: "#888", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setEditing({ ...editing, [dt.articleType]: { rate: String(config?.rate || ""), bonusRate: String(config?.bonusRate || "0") } })}
                          style={{ padding: "4px 12px", background: "#eff6ff", color: "#2563eb", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          Set Rate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </main>
    </div>
  );
}
