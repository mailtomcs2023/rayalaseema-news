"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";

interface MandiPrice {
  id: string; commodity: string; commodityEn: string; market: string; marketEn: string;
  price: number; unit: string; change: number; date: string; active: boolean;
}

const defaultCommodities = [
  { commodity: "మిర్చి", commodityEn: "Chilli" },
  { commodity: "పత్తి", commodityEn: "Cotton" },
  { commodity: "వేరుశనగ", commodityEn: "Groundnut" },
  { commodity: "వరి", commodityEn: "Paddy" },
  { commodity: "జొన్నలు", commodityEn: "Jowar" },
  { commodity: "కందులు", commodityEn: "Toor Dal" },
  { commodity: "శనగలు", commodityEn: "Bengal Gram" },
  { commodity: "ప్రత్తి గింజలు", commodityEn: "Cottonseed" },
];

const defaultMarkets = [
  { market: "కర్నూలు", marketEn: "Kurnool" },
  { market: "అనంతపురం", marketEn: "Anantapur" },
  { market: "కడప", marketEn: "Kadapa" },
  { market: "చిత్తూరు", marketEn: "Chittoor" },
];

export default function MandiPage() {
  const [prices, setPrices] = useState<MandiPrice[]>([]);
  const [form, setForm] = useState({ commodityIdx: 0, marketIdx: 0, price: "", change: "0" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/mandi").then((r) => r.json()).then(setPrices);
  }, []);

  const addPrice = async () => {
    if (!form.price) return;
    setCreating(true);
    const c = defaultCommodities[form.commodityIdx];
    const m = defaultMarkets[form.marketIdx];
    const res = await fetch("/api/mandi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...c, ...m,
        price: parseFloat(form.price),
        change: parseFloat(form.change) || 0,
        unit: "క్వింటల్",
      }),
    });
    const newPrice = await res.json();
    setPrices([newPrice, ...prices]);
    setForm({ ...form, price: "", change: "0" });
    setCreating(false);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 24 }}>Mandi Prices (మండి ధరలు)</h1>

        {/* Add Price */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 20, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Add Today&apos;s Price</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 2 }}>Commodity</label>
              <select value={form.commodityIdx} onChange={(e) => setForm({ ...form, commodityIdx: +e.target.value })}
                style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13 }}>
                {defaultCommodities.map((c, i) => <option key={i} value={i}>{c.commodityEn} ({c.commodity})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 2 }}>Market</label>
              <select value={form.marketIdx} onChange={(e) => setForm({ ...form, marketIdx: +e.target.value })}
                style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13 }}>
                {defaultMarkets.map((m, i) => <option key={i} value={i}>{m.marketEn} ({m.market})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 2 }}>Price (Rs/Quintal)</label>
              <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="8500" style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, width: 120 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 2 }}>Change %</label>
              <input type="number" step="0.1" value={form.change} onChange={(e) => setForm({ ...form, change: e.target.value })}
                style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, width: 80 }} />
            </div>
            <button onClick={addPrice} disabled={creating} style={{
              padding: "8px 20px", background: "#16a34a", color: "#fff", border: "none",
              borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>
              {creating ? "Adding..." : "Add Price"}
            </button>
          </div>
        </div>

        {/* Prices Table */}
        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div className="table-scroll">
          <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888" }}>Commodity</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888" }}>Market</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: "#888" }}>Price (Rs)</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: "#888" }}>Change</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888" }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f9fafb" }}>
                  <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600 }}>{p.commodityEn} <span style={{ color: "#888" }}>({p.commodity})</span></td>
                  <td style={{ padding: "10px 16px", fontSize: 13 }}>{p.marketEn}</td>
                  <td style={{ padding: "10px 16px", fontSize: 14, fontWeight: 800, textAlign: "right" }}>{"\u20B9"}{p.price.toLocaleString()}</td>
                  <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700, textAlign: "right", color: p.change > 0 ? "#16a34a" : p.change < 0 ? "#dc2626" : "#888" }}>
                    {p.change > 0 ? "+" : ""}{p.change}%
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 12, color: "#888" }}>{new Date(p.date).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </main>
    </div>
  );
}
