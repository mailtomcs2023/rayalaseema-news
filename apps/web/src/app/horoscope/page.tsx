"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

interface Rashi {
  id: string; name: string; nameEn: string; symbol: string; icon: string; dates: string;
  prediction: string; predictionEn?: string; weeklyPrediction?: string;
}

interface Panchangam {
  today: { date: string; varam: string; teluguMonth: string; tithi: string; paksha: string; nakshatra: string; yoga: string; karana: string; sunrise: string; sunset: string; rahuKalam: string };
  festivals: { thisMonth: { day: number; name: string; nameEn: string; type: string }[]; nextMonth: any[] };
  muhurthams: { type: string; name: string; nameEn: string; icon: string; dates: { day: number; date: string; nakshatra: string }[] }[];
  monthName: string;
}

const rashiColors = [
  "#dc2626", "#b45309", "#16a34a", "#0891b2", "#d97706", "#7c3aed",
  "#2563eb", "#be185d", "#ea580c", "#4338ca", "#0d9488", "#6366f1",
];

const rashiSymbols = ["\u2648", "\u2649", "\u264A", "\u264B", "\u264C", "\u264D", "\u264E", "\u264F", "\u2650", "\u2651", "\u2652", "\u2653"];

const rashiDateRanges = [
  { id: "mesha", s: [3, 21], e: [4, 19] }, { id: "vrushabha", s: [4, 20], e: [5, 20] },
  { id: "mithuna", s: [5, 21], e: [6, 20] }, { id: "karkataka", s: [6, 21], e: [7, 22] },
  { id: "simha", s: [7, 23], e: [8, 22] }, { id: "kanya", s: [8, 23], e: [9, 22] },
  { id: "tula", s: [9, 23], e: [10, 22] }, { id: "vrushchika", s: [10, 23], e: [11, 21] },
  { id: "dhanu", s: [11, 22], e: [12, 21] }, { id: "makara", s: [12, 22], e: [1, 19] },
  { id: "kumbha", s: [1, 20], e: [2, 18] }, { id: "meena", s: [2, 19], e: [3, 20] },
];

function getRashiFromDate(m: number, d: number): string {
  for (const r of rashiDateRanges) {
    if (r.s[0] <= r.e[0]) {
      if ((m === r.s[0] && d >= r.s[1]) || (m === r.e[0] && d <= r.e[1])) return r.id;
    } else {
      if ((m === r.s[0] && d >= r.s[1]) || (m === r.e[0] && d <= r.e[1])) return r.id;
    }
  }
  return "mesha";
}

export default function HoroscopePage() {
  const [data, setData] = useState<{ rashis: Rashi[]; date: string } | null>(null);
  const [panchangam, setPanchangam] = useState<Panchangam | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [birthDate, setBirthDate] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/horoscope").then((r) => r.json()),
      fetch("/api/panchangam").then((r) => r.json()),
    ]).then(([h, p]) => { setData(h); setPanchangam(p); setLoading(false); }).catch(() => setLoading(false));

    const saved = localStorage.getItem("my-rashi");
    if (saved) setSelected(saved);
  }, []);

  const saveRashi = (id: string) => { setSelected(id); localStorage.setItem("my-rashi", id); };
  const selectedRashi = data?.rashis.find((r) => r.id === selected);
  const selectedIdx = data?.rashis.findIndex((r) => r.id === selected) ?? -1;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 12px" }}>
        {/* Page Title */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#111" }}>నేటి రాశి ఫలాలు & పంచాంగం</h1>
          <p style={{ fontSize: 13, color: "#888" }}>{data?.date || ""} | Daily Horoscope & Panchangam</p>
        </div>

        {/* Two column layout: Main (rashis) + Sidebar (panchangam) */}
        <div style={{ display: "flex", gap: 16 }} className="horoscope-layout">
          {/* ===== LEFT: Horoscope Main ===== */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Birth date picker */}
            {!selected && !loading && (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 16, textAlign: "center" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 8 }}>మీ రాశి తెలియదా? పుట్టిన తేదీ ఎంచుకోండి</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
                    style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
                  <button onClick={() => { if (birthDate) { const d = new Date(birthDate); saveRashi(getRashiFromDate(d.getMonth() + 1, d.getDate())); } }}
                    disabled={!birthDate} style={{ padding: "8px 16px", background: birthDate ? "var(--color-brand)" : "#e5e7eb", color: birthDate ? "#fff" : "#999", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: birthDate ? "pointer" : "default" }}>
                    రాశి కనుగొనండి
                  </button>
                </div>
              </div>
            )}

            {/* Rashi selector grid */}
            {!loading && data?.rashis && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 16 }}>
                {data.rashis.map((r, i) => (
                  <button key={r.id} onClick={() => saveRashi(r.id)} style={{
                    padding: "10px 4px", borderRadius: 8, border: selected === r.id ? `2px solid ${rashiColors[i]}` : "2px solid transparent",
                    background: selected === r.id ? `${rashiColors[i]}10` : "#fff", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}>
                    <span style={{ fontSize: 26, lineHeight: 1 }}>{rashiSymbols[i]}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: selected === r.id ? rashiColors[i] : "#333" }}>{r.name}</span>
                    <span style={{ fontSize: 9, color: "#999" }}>{r.nameEn}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Selected rashi - big prediction */}
            {selectedRashi && (
              <div style={{ background: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, borderLeft: `4px solid ${rashiColors[selectedIdx]}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 36, lineHeight: 1 }}>{rashiSymbols[selectedIdx]}</span>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 900, color: rashiColors[selectedIdx] }}>{selectedRashi.name}</h2>
                    <p style={{ fontSize: 11, color: "#888" }}>{selectedRashi.nameEn} | {selectedRashi.dates}</p>
                  </div>
                  <button onClick={() => { setSelected(null); localStorage.removeItem("my-rashi"); }}
                    style={{ fontSize: 10, color: "#888", background: "#f3f4f6", border: "none", padding: "4px 10px", borderRadius: 4, cursor: "pointer" }}>
                    మార్చు
                  </button>
                </div>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: "#888", margin: "0 0 4px" }}>ఈ రోజు</h3>
                <p style={{ fontSize: 16, lineHeight: 2, color: "#222" }}>{selectedRashi.prediction || "త్వరలో…"}</p>
                {selectedRashi.weeklyPrediction && (
                  <>
                    <h3 style={{ fontSize: 13, fontWeight: 800, color: "#888", margin: "16px 0 4px" }}>ఈ వారం</h3>
                    <p style={{ fontSize: 15, lineHeight: 1.9, color: "#333" }}>{selectedRashi.weeklyPrediction}</p>
                  </>
                )}
              </div>
            )}

            {/* All 12 rashis */}
            <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 10, color: "#111" }}>అన్ని రాశులు</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {data?.rashis.map((r, i) => (
                <div key={r.id} onClick={() => saveRashi(r.id)} style={{
                  background: "#fff", borderRadius: 8, padding: 14, cursor: "pointer",
                  borderTop: `3px solid ${rashiColors[i]}`, boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  transition: "box-shadow 0.15s",
                }} className="hover:shadow-md">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 24 }}>{rashiSymbols[i]}</span>
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 800, color: rashiColors[i] }}>{r.name}</h3>
                      <p style={{ fontSize: 10, color: "#888" }}>{r.nameEn}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.7, color: "#444", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                    {r.prediction || "..."}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ===== RIGHT SIDEBAR: Panchangam + Festivals + Muhurthams ===== */}
          <div style={{ width: 320, flexShrink: 0 }} className="horoscope-sidebar">
            {panchangam && (
              <>
                {/* Today's Panchangam */}
                <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <div style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", padding: "10px 14px", color: "#fff" }}>
                    <h3 style={{ fontSize: 15, fontWeight: 900 }}>నేటి పంచాంగం</h3>
                    <p style={{ fontSize: 11, opacity: 0.85 }}>{panchangam.today.date}</p>
                  </div>
                  <div style={{ padding: 12 }}>
                    {[
                      { l: "తెలుగు మాసం", v: panchangam.today.teluguMonth },
                      { l: "తిథి", v: `${panchangam.today.tithi} (${panchangam.today.paksha})` },
                      { l: "నక్షత్రం", v: panchangam.today.nakshatra },
                      { l: "యోగం", v: panchangam.today.yoga },
                      { l: "కరణం", v: panchangam.today.karana },
                      { l: "సూర్యోదయం / అస్తమయం", v: `${panchangam.today.sunrise} / ${panchangam.today.sunset}` },
                      { l: "రాహు కాలం", v: panchangam.today.rahuKalam },
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < 6 ? "1px solid #f5f5f5" : "none" }}>
                        <span style={{ fontSize: 12, color: "#888" }}>{item.l}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#222", textAlign: "right", maxWidth: "55%" }}>{item.v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Festivals */}
                <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <div style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", padding: "10px 14px", color: "#fff" }}>
                    <h3 style={{ fontSize: 15, fontWeight: 900 }}>పండుగలు & సెలవులు</h3>
                    <p style={{ fontSize: 11, opacity: 0.85 }}>{panchangam.monthName}</p>
                  </div>
                  <div style={{ padding: 10 }}>
                    {panchangam.festivals.thisMonth.length > 0 ? panchangam.festivals.thisMonth.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < panchangam.festivals.thisMonth.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                        <span style={{
                          width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                          background: f.type === "festival" ? "#fef3c7" : "#dbeafe",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 900, color: f.type === "festival" ? "#b45309" : "#1d4ed8",
                        }}>{f.day}</span>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{f.name}</p>
                          <p style={{ fontSize: 10, color: "#888" }}>{f.nameEn}</p>
                        </div>
                      </div>
                    )) : <p style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: 10 }}>ఈ నెల పండుగలు లేవు</p>}
                  </div>
                </div>

                {/* Muhurthams */}
                <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <div style={{ background: "linear-gradient(135deg, #16a34a, #15803d)", padding: "10px 14px", color: "#fff" }}>
                    <h3 style={{ fontSize: 15, fontWeight: 900 }}>శుభ ముహూర్తాలు</h3>
                    <p style={{ fontSize: 11, opacity: 0.85 }}>{panchangam.monthName}</p>
                  </div>
                  <div style={{ padding: 10 }}>
                    {panchangam.muhurthams.slice(0, 4).map((m, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <p style={{ fontSize: 12, fontWeight: 800, color: "#111", marginBottom: 4 }}>{m.icon} {m.name}</p>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {m.dates.map((d: any, j: number) => (
                            <span key={j} style={{
                              fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
                              background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0",
                            }}>
                              {d.date}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />

      <style>{`
        @media (max-width: 768px) {
          .horoscope-layout { flex-direction: column !important; }
          .horoscope-sidebar { width: 100% !important; }
        }
      `}</style>
    </div>
  );
}
