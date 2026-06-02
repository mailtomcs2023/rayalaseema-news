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

// Real zodiac artwork (self-hosted OpenMoji color SVGs in /public/rashis),
// in the same order as data.rashis (mesha \u2026 meena). Swap these files to use
// custom rashi art without touching the component.
const rashiImages = [
  "/rashis/mesha.svg", "/rashis/vrushabha.svg", "/rashis/mithuna.svg", "/rashis/karkataka.svg",
  "/rashis/simha.svg", "/rashis/kanya.svg", "/rashis/tula.svg", "/rashis/vrushchika.svg",
  "/rashis/dhanu.svg", "/rashis/makara.svg", "/rashis/kumbha.svg", "/rashis/meena.svg",
];

export default function HoroscopePage() {
  const [data, setData] = useState<{ rashis: Rashi[]; date: string } | null>(null);
  const [panchangam, setPanchangam] = useState<Panchangam | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
                    <img src={rashiImages[i]} alt={r.name} width={34} height={34} loading="lazy" style={{ display: "block" }} />
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
                  <img src={rashiImages[selectedIdx]} alt={selectedRashi.name} width={46} height={46} style={{ display: "block" }} />
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
                    <img src={rashiImages[i]} alt={r.name} width={30} height={30} loading="lazy" style={{ display: "block" }} />
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
                {panchangam.today && (
                <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <div style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", padding: "10px 14px", color: "#fff" }}>
                    <h3 style={{ fontSize: 15, fontWeight: 900 }}>నేటి పంచాంగం</h3>
                    <p style={{ fontSize: 11, opacity: 0.85 }}>{panchangam.today.date}</p>
                  </div>
                  <div style={{ padding: 12 }}>
                    {[
                      { l: "తెలుగు మాసం", v: panchangam.today.teluguMonth },
                      { l: "తిథి", v: panchangam.today.tithi ? `${panchangam.today.tithi}${panchangam.today.paksha ? ` (${panchangam.today.paksha})` : ""}` : "" },
                      { l: "నక్షత్రం", v: panchangam.today.nakshatra },
                      { l: "యోగం", v: panchangam.today.yoga },
                      { l: "కరణం", v: panchangam.today.karana },
                      { l: "సూర్యోదయం / అస్తమయం", v: (panchangam.today.sunrise || panchangam.today.sunset) ? `${panchangam.today.sunrise ?? "—"} / ${panchangam.today.sunset ?? "—"}` : "" },
                      { l: "రాహు కాలం", v: panchangam.today.rahuKalam },
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < 6 ? "1px solid #f5f5f5" : "none" }}>
                        <span style={{ fontSize: 12, color: "#888" }}>{item.l}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#222", textAlign: "right", maxWidth: "55%" }}>{item.v || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                )}

                {/* Festivals */}
                <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <div style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", padding: "10px 14px", color: "#fff" }}>
                    <h3 style={{ fontSize: 15, fontWeight: 900 }}>పండుగలు & సెలవులు</h3>
                    <p style={{ fontSize: 11, opacity: 0.85 }}>{panchangam.monthName}</p>
                  </div>
                  <div style={{ padding: 10 }}>
                    {(panchangam.festivals?.thisMonth?.length ?? 0) > 0 ? (panchangam.festivals?.thisMonth ?? []).map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < (panchangam.festivals?.thisMonth?.length ?? 0) - 1 ? "1px solid #f5f5f5" : "none" }}>
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
                    {(panchangam.muhurthams || []).slice(0, 4).map((m, i) => (
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
