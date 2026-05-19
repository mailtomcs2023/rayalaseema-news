"use client";

import { useState } from "react";

// All data from DB via props - no hardcoded content

export function YettetaCartoon({ items }: { items: { id: string; title: string; caption: string; image: string; date: string }[] }) {
  const allCartoons = items;
  if (!allCartoons || allCartoons.length === 0) return null;
  const [current, setCurrent] = useState(0);
  const cartoon = allCartoons[current];

  const next = () => setCurrent((p) => (p + 1) % allCartoons.length);
  const prev = () => setCurrent((p) => (p - 1 + allCartoons.length) % allCartoons.length);

  return (
    <div>
      {/* Header tab */}
      <div className="section-tab" style={{ display: "flex", width: "100%", justifyContent: "center" }}>
        <span className="section-label">ఎట్టెట 😄</span>
      </div>

      {/* Cartoon card */}
      <div style={{ border: "1px solid var(--border-color)", borderTop: 0, background: "#fff" }}>
        {/* Cartoon image */}
        <div style={{ position: "relative" }}>
          <img
            src={cartoon.image}
            alt={cartoon.title}
            style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }}
          />
          {/* Caption overlay at bottom */}
          <div style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
            padding: "20px 10px 10px",
          }}>
            <p style={{ fontSize: "var(--fs-body-sm)", fontWeight: 800, color: "#fff", lineHeight: 1.5, marginBottom: 4 }}>
              {cartoon.title}
            </p>
            <p style={{ fontSize: "var(--fs-caption)", fontWeight: 700, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
              "{cartoon.caption}"
            </p>
          </div>
        </div>

        {/* Date + nav */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderTop: "1px solid var(--border-color)",
          background: "#fafafa",
        }}>
          <button onClick={prev} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#666" }}>
            ‹
          </button>
          <span style={{ fontSize: "var(--fs-caption)", color: "#888" }}>
            {cartoon.date} • {current + 1}/{allCartoons.length}
          </span>
          <button onClick={next} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#666" }}>
            ›
          </button>
        </div>

        {/* Cartoonist credit */}
        <div style={{
          textAlign: "center",
          padding: "4px 8px 8px",
          fontSize: "var(--fs-tiny)",
          color: "#999",
        }}>
          కార్టూనిస్ట్: RE స్పెషల్
        </div>
      </div>

      {/* Archive link */}
      <a
        href="/cartoons"
        style={{
          display: "block",
          textAlign: "center",
          padding: "6px",
          background: "var(--color-brand)",
          color: "#fff",
          fontSize: "var(--fs-caption)",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        గత కార్టూన్లు చూడండి →
      </a>
    </div>
  );
}
