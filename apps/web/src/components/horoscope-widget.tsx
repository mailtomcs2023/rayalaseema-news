"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// Zodiac glyphs kept (content, not chrome — readers recognize them)
const rashiList = [
  { id: "mesha", name: "మేషం", icon: "♈" },
  { id: "vrushabha", name: "వృషభం", icon: "♉" },
  { id: "mithuna", name: "మిథునం", icon: "♊" },
  { id: "karkataka", name: "కర్కాటకం", icon: "♋" },
  { id: "simha", name: "సింహం", icon: "♌" },
  { id: "kanya", name: "కన్య", icon: "♍" },
  { id: "tula", name: "తులా", icon: "♎" },
  { id: "vrushchika", name: "వృశ్చికం", icon: "♏" },
  { id: "dhanu", name: "ధనుస్సు", icon: "♐" },
  { id: "makara", name: "మకరం", icon: "♑" },
  { id: "kumbha", name: "కుంభం", icon: "♒" },
  { id: "meena", name: "మీనం", icon: "♓" },
];

const IconStar = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

export function HoroscopeWidget() {
  const [myRashi, setMyRashi] = useState<string | null>(null);
  const [prediction, setPrediction] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("my-rashi");
    if (saved) {
      setMyRashi(saved);
      fetch(`/api/horoscope?rashi=${saved}`)
        .then((r) => r.json())
        .then((data) => { if (data?.prediction) setPrediction(data.prediction); })
        .catch(() => {});
    }
  }, []);

  const rashi = rashiList.find((r) => r.id === myRashi);

  return (
    <div className="panel" style={{ marginTop: "var(--sp-2)" }}>
      <Link href="/horoscope" className="section-head" style={{ textDecoration: "none" }}>
        <span className="section-head__icon"><IconStar /></span>
        <span className="section-head__label">రాశి ఫలాలు</span>
        <span className="section-head__tail">12 rashis →</span>
      </Link>

      <div style={{ padding: "var(--sp-3)" }}>
        {rashi && prediction ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
              <span style={{ fontSize: 22, color: "var(--brand)" }} aria-hidden>{rashi.icon}</span>
              <span style={{ fontSize: "var(--t-md)", fontWeight: "var(--w-head)" as any, color: "var(--n-900)" }}>{rashi.name}</span>
              <span style={{ fontSize: "var(--t-xs)", background: "var(--brand-soft)", color: "var(--brand-dark)", padding: "2px var(--sp-2)", borderRadius: "var(--r-sm)", fontWeight: "var(--w-head)" as any }}>మీ రాశి</span>
            </div>
            <p style={{ fontSize: "var(--t-sm)", color: "var(--n-600)", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden", margin: 0 }}>
              {prediction}
            </p>
            <Link href="/horoscope" className="link-hover" style={{ fontSize: "var(--t-xs)", color: "var(--brand)", fontWeight: "var(--w-emp)" as any, textDecoration: "none", marginTop: "var(--sp-2)", display: "inline-block" }}>
              పూర్తి ఫలాలు →
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--sp-1)" }}>
            {rashiList.map((r) => (
              <Link key={r.id} href="/horoscope" style={{
                textDecoration: "none", display: "flex", flexDirection: "column",
                alignItems: "center", padding: "var(--sp-2) 2px", borderRadius: "var(--r-sm)",
                background: "var(--n-50)", fontSize: "var(--t-xs)", fontWeight: "var(--w-emp)" as any, color: "var(--n-600)",
              }}>
                <span style={{ fontSize: 18, color: "var(--brand)" }} aria-hidden>{r.icon}</span>
                <span>{r.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
