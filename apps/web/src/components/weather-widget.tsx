"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const weatherIcons: Record<number, string> = {
  0: "☀️", 1: "⛅", 2: "⛅", 3: "☁️",
  45: "\u{1F32B}️", 48: "\u{1F32B}️",
  51: "\u{1F326}️", 53: "\u{1F326}️", 55: "\u{1F327}️",
  61: "\u{1F327}️", 63: "\u{1F327}️", 65: "\u{1F327}️",
  80: "\u{1F326}️", 81: "\u{1F327}️", 82: "\u{1F327}️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

interface DistrictWeather {
  name: string;
  nameEn: string;
  slug: string;
  current: { temp: number; weatherCode: number; humidity: number; windSpeed: number; uvIndex: number };
}

const IconSun = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
  </svg>
);

export function WeatherWidget() {
  const [data, setData] = useState<DistrictWeather[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.json())
      .then((res) => {
        if (res.districts) setData(res.districts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data.length) return null;

  const displayed = data.slice(0, 4);

  return (
    <Link href="/weather" className="panel" style={{ textDecoration: "none", display: "block", marginTop: "var(--sp-2)" }}>
      <div className="section-head">
        <span className="section-head__icon"><IconSun /></span>
        <span className="section-head__label">వాతావరణం</span>
        <span className="section-head__tail">8 districts →</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-2)", padding: "var(--sp-2) var(--sp-3) var(--sp-3)" }}>
        {displayed.map((d) => (
          <div key={d.nameEn} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", padding: "var(--sp-2)", background: "var(--n-50)", borderRadius: "var(--r-sm)" }}>
            <span style={{ fontSize: 22 }} aria-hidden>{weatherIcons[d.current.weatherCode] || "☀️"}</span>
            <div>
              <div style={{ fontSize: "var(--t-xs)", fontWeight: "var(--w-emp)" as any, color: "var(--n-700)" }}>{d.name}</div>
              <div style={{ fontSize: "var(--t-lg)", fontWeight: "var(--w-head)" as any, color: "var(--n-900)" }}>{d.current.temp}°C</div>
              <div style={{ fontSize: "var(--t-xs)", color: "var(--n-500)" }}>RH {d.current.humidity}%</div>
            </div>
          </div>
        ))}
      </div>
    </Link>
  );
}
