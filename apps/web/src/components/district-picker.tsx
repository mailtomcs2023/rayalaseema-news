"use client";

import { useState, useEffect } from "react";

const districts = [
  { name: "కర్నూలు", slug: "kurnool" },
  { name: "నంద్యాల", slug: "nandyal" },
  { name: "అనంతపురం", slug: "ananthapuramu" },
  { name: "శ్రీ సత్యసాయి", slug: "sri-sathya-sai" },
  { name: "వై.యస్.ఆర్ కడప", slug: "ysr-kadapa" },
  { name: "అన్నమయ్య", slug: "annamayya" },
  { name: "తిరుపతి", slug: "tirupati" },
  { name: "చిత్తూరు", slug: "chittoor" },
];

export function DistrictPicker() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only show on first visit (no district selected yet)
    if (!localStorage.getItem("my-district")) {
      // Delay 2 seconds so page loads first
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const pick = (slug: string) => {
    localStorage.setItem("my-district", slug);
    document.cookie = `my-district=${slug};path=/;max-age=31536000`;
    setShow(false);
    // Reload to apply personalization
    window.location.reload();
  };

  const skip = () => {
    localStorage.setItem("my-district", "all");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "28px 24px",
        maxWidth: 400, width: "100%", textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        animation: "slideUp 0.3s ease-out",
      }}>
        {/* Logo */}
        <img src="/logo.svg" alt="RE" style={{ height: 40, margin: "0 auto 12px" }} />

        <h2 style={{ fontSize: 20, fontWeight: 900, color: "#111", marginBottom: 4 }}>
          మీ జిల్లా ఎంచుకోండి
        </h2>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
          మీ జిల్లా వార్తలు ముందుగా చూపిస్తాం
        </p>

        {/* District buttons - 2 column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {districts.map((d) => (
            <button
              key={d.slug}
              onClick={() => pick(d.slug)}
              style={{
                padding: "12px 8px", borderRadius: 10,
                border: "2px solid #f0f0f0", background: "#fff",
                cursor: "pointer", fontSize: 14, fontWeight: 700,
                color: "#333", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.borderColor = "var(--color-brand)";
                (e.target as HTMLButtonElement).style.background = "#fff1f1";
                (e.target as HTMLButtonElement).style.color = "var(--color-brand)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.borderColor = "#f0f0f0";
                (e.target as HTMLButtonElement).style.background = "#fff";
                (e.target as HTMLButtonElement).style.color = "#333";
              }}
            >
              {d.name}
            </button>
          ))}
        </div>

        {/* Skip */}
        <button onClick={skip} style={{
          marginTop: 16, padding: "8px 24px", background: "transparent",
          border: "none", color: "#aaa", fontSize: 12, cursor: "pointer",
        }}>
          అన్ని జిల్లాలు చూపించు (Skip)
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Helper to get user's district preference
export function getMyDistrict(): string | null {
  if (typeof window === "undefined") return null;
  const d = localStorage.getItem("my-district");
  return d && d !== "all" ? d : null;
}
