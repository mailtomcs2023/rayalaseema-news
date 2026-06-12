"use client";

import { useState, useEffect } from "react";
import { Star } from "lucide-react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";

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
// in the same order as data.rashis (mesha … meena). Swap these files to use
// custom rashi art without touching the component.
const rashiImages = [
  "/rashis/mesha.svg", "/rashis/vrushabha.svg", "/rashis/mithuna.svg", "/rashis/karkataka.svg",
  "/rashis/simha.svg", "/rashis/kanya.svg", "/rashis/tula.svg", "/rashis/vrushchika.svg",
  "/rashis/dhanu.svg", "/rashis/makara.svg", "/rashis/kumbha.svg", "/rashis/meena.svg",
];

// Reusable on-brand card header (replaces the old per-card gradient bars).
function CardHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ background: "var(--brand)", padding: "9px 14px", color: "#fff" }}>
      <h3 style={{ fontSize: 15, fontWeight: 900 }}>{title}</h3>
      {sub ? <p style={{ fontSize: 11, opacity: 0.85 }}>{sub}</p> : null}
    </div>
  );
}

export default function HoroscopePage() {
  const [data, setData] = useState<{ rashis: Rashi[]; date: string } | null>(null);
  const [panchangam, setPanchangam] = useState<Panchangam | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Independent fetches: render the rashis as soon as the fast, DB-backed
    // horoscope returns - do NOT block the page on the slower panchangam
    // (which still calls the credit-less Prokerala and can be slow/empty).
    fetch("/api/horoscope").then((r) => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
    fetch("/api/panchangam").then((r) => r.json()).then(setPanchangam).catch(() => {});

    const saved = localStorage.getItem("my-rashi");
    if (saved) setSelected(saved);
  }, []);

  const saveRashi = (id: string) => { setSelected(id); localStorage.setItem("my-rashi", id); };
  const selectedRashi = data?.rashis.find((r) => r.id === selected);
  const selectedIdx = data?.rashis.findIndex((r) => r.id === selected) ?? -1;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 12px 44px" }}>
        {/* Page title */}
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "var(--n-900)", lineHeight: 1.2 }}>నేటి రాశి ఫలాలు & పంచాంగం</h1>
          <p style={{ fontSize: 13, color: "var(--n-500)", marginTop: 2 }}>{data?.date || ""} · Daily Horoscope &amp; Panchangam</p>
        </div>

        {/* Two column layout: Main (rashis) + Sidebar (panchangam) */}
        <div style={{ display: "flex", gap: 16 }} className="horoscope-layout">
          {/* ===== LEFT: Horoscope Main ===== */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Rashi selector grid */}
            {!loading && data?.rashis && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 16 }} className="rashi-pick">
                {data.rashis.map((r, i) => {
                  const active = selected === r.id;
                  return (
                    <Button
                      key={r.id}
                      variant="ghost"
                      onClick={() => saveRashi(r.id)}
                      className="h-auto w-full flex-col gap-0.5 rounded-lg border p-2.5 hover:bg-transparent"
                      style={{
                        borderColor: active ? rashiColors[i] : "#e5e7eb",
                        background: active ? `${rashiColors[i]}10` : "#fff",
                      }}
                    >
                      <img src={rashiImages[i]} alt={r.name} width={34} height={34} loading="lazy" style={{ display: "block" }} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: active ? rashiColors[i] : "var(--n-700)" }}>{r.name}</span>
                      <span style={{ fontSize: 9, color: "var(--n-500)" }}>{r.nameEn}</span>
                    </Button>
                  );
                })}
              </div>
            )}

            {/* Selected rashi - big prediction */}
            {selectedRashi && (
              <div style={{ background: "#fff", borderRadius: 8, padding: 20, marginBottom: 16, border: "1px solid #e5e7eb" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <img src={rashiImages[selectedIdx]} alt={selectedRashi.name} width={46} height={46} style={{ display: "block" }} />
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 900, color: rashiColors[selectedIdx] }}>{selectedRashi.name}</h2>
                    <p style={{ fontSize: 11, color: "var(--n-500)" }}>{selectedRashi.nameEn} | {selectedRashi.dates}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => { setSelected(null); localStorage.removeItem("my-rashi"); }}
                  >
                    మార్చు
                  </Button>
                </div>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: "var(--n-500)", margin: "0 0 4px" }}>ఈ రోజు</h3>
                <p style={{ fontSize: 16, lineHeight: 2, color: "var(--n-900)" }}>{selectedRashi.prediction || "త్వరలో…"}</p>
                {selectedRashi.weeklyPrediction && (
                  <>
                    <h3 style={{ fontSize: 13, fontWeight: 800, color: "var(--n-500)", margin: "16px 0 4px" }}>ఈ వారం</h3>
                    <p style={{ fontSize: 15, lineHeight: 1.9, color: "var(--n-700)" }}>{selectedRashi.weeklyPrediction}</p>
                  </>
                )}
              </div>
            )}

            {/* All 12 rashis */}
            <div style={{ marginBottom: 12 }}>
              <SectionHeading title="అన్ని రాశులు" icon={Star} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="rashi-all">
              {data?.rashis.map((r, i) => (
                <Button
                  key={r.id}
                  variant="ghost"
                  onClick={() => saveRashi(r.id)}
                  className="rashi-tile h-auto w-full flex-col items-stretch gap-1.5 rounded-lg border bg-white p-3.5 text-left hover:bg-white"
                  style={{ borderColor: "#e5e7eb" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <img src={rashiImages[i]} alt={r.name} width={30} height={30} loading="lazy" style={{ display: "block" }} />
                    <span>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: rashiColors[i] }}>{r.name}</span>
                      <span style={{ display: "block", fontSize: 10, color: "var(--n-500)" }}>{r.nameEn}</span>
                    </span>
                  </span>
                  <span style={{ fontSize: 13, lineHeight: 1.7, color: "var(--n-700)", fontWeight: 400, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden", whiteSpace: "normal" }}>
                    {r.prediction || "..."}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          {/* ===== RIGHT SIDEBAR: Panchangam + Festivals + Muhurthams ===== */}
          <div style={{ width: 320, flexShrink: 0 }} className="horoscope-sidebar">
            {panchangam && (
              <>
                {/* Today's Panchangam */}
                {(panchangam.today?.tithi || panchangam.today?.teluguMonth || panchangam.today?.nakshatra) && (
                <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", marginBottom: 12, border: "1px solid #e5e7eb" }}>
                  <CardHeader title="నేటి పంచాంగం" sub={panchangam.today.date} />
                  <div style={{ padding: 12 }}>
                    {[
                      { l: "తెలుగు మాసం", v: panchangam.today.teluguMonth },
                      { l: "తిథి", v: panchangam.today.tithi ? `${panchangam.today.tithi}${panchangam.today.paksha ? ` (${panchangam.today.paksha})` : ""}` : "" },
                      { l: "నక్షత్రం", v: panchangam.today.nakshatra },
                      { l: "యోగం", v: panchangam.today.yoga },
                      { l: "కరణం", v: panchangam.today.karana },
                      { l: "సూర్యోదయం / అస్తమయం", v: (panchangam.today.sunrise || panchangam.today.sunset) ? `${panchangam.today.sunrise ?? "-"} / ${panchangam.today.sunset ?? "-"}` : "" },
                      { l: "రాహు కాలం", v: panchangam.today.rahuKalam },
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < 6 ? "1px solid #f3f4f6" : "none" }}>
                        <span style={{ fontSize: 12, color: "var(--n-500)" }}>{item.l}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--n-900)", textAlign: "right", maxWidth: "55%" }}>{item.v || "-"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                )}

                {/* Festivals */}
                <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", marginBottom: 12, border: "1px solid #e5e7eb" }}>
                  <CardHeader title="పండుగలు & సెలవులు" sub={panchangam.monthName} />
                  <div style={{ padding: 10 }}>
                    {(panchangam.festivals?.thisMonth?.length ?? 0) > 0 ? (panchangam.festivals?.thisMonth ?? []).map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < (panchangam.festivals?.thisMonth?.length ?? 0) - 1 ? "1px solid #f3f4f6" : "none" }}>
                        <span style={{
                          width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                          background: f.type === "festival" ? "#fef3c7" : "#dbeafe",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 900, color: f.type === "festival" ? "#b45309" : "#1d4ed8",
                        }}>{f.day}</span>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--n-900)" }}>{f.name}</p>
                          <p style={{ fontSize: 10, color: "var(--n-500)" }}>{f.nameEn}</p>
                        </div>
                      </div>
                    )) : <p style={{ fontSize: 12, color: "var(--n-500)", textAlign: "center", padding: 10 }}>ఈ నెల పండుగలు లేవు</p>}
                  </div>
                </div>

                {/* Muhurthams */}
                {(panchangam.muhurthams?.length ?? 0) > 0 && (
                <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                  <CardHeader title="శుభ ముహూర్తాలు" sub={panchangam.monthName} />
                  <div style={{ padding: 10 }}>
                    {(panchangam.muhurthams || []).slice(0, 4).map((m, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <p style={{ fontSize: 12, fontWeight: 800, color: "var(--n-900)", marginBottom: 4 }}>{m.name}</p>
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
                )}
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />

      <style>{`
        .rashi-tile { transition: border-color 0.15s, box-shadow 0.15s; }
        .rashi-tile:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
        @media (max-width: 768px) {
          .horoscope-layout { flex-direction: column !important; }
          .horoscope-sidebar { width: 100% !important; }
          .rashi-pick { grid-template-columns: repeat(4, 1fr) !important; }
          .rashi-all { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
