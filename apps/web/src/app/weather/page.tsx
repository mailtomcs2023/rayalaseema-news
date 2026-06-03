"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";

const allDistricts = [
  { name: "కర్నూలు", nameEn: "Kurnool", lat: 15.83, lon: 78.04, slug: "kurnool" },
  { name: "నంద్యాల", nameEn: "Nandyal", lat: 15.48, lon: 78.48, slug: "nandyal" },
  { name: "అనంతపురం", nameEn: "Anantapur", lat: 14.68, lon: 77.60, slug: "ananthapuramu" },
  { name: "శ్రీ సత్యసాయి", nameEn: "Sri Sathya Sai", lat: 14.46, lon: 77.34, slug: "sri-sathya-sai" },
  { name: "వై.యస్.ఆర్ కడప", nameEn: "YSR Kadapa", lat: 14.47, lon: 78.82, slug: "ysr-kadapa" },
  { name: "తిరుపతి", nameEn: "Tirupati", lat: 13.63, lon: 79.42, slug: "tirupati" },
  { name: "అన్నమయ్య", nameEn: "Annamayya", lat: 14.22, lon: 79.08, slug: "annamayya" },
  { name: "చిత్తూరు", nameEn: "Chittoor", lat: 13.22, lon: 79.10, slug: "chittoor" },
];

const weatherCodes: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear sky", icon: "\u2600\uFE0F" },
  1: { label: "Mainly clear", icon: "\u{1F324}\uFE0F" },
  2: { label: "Partly cloudy", icon: "\u26C5" },
  3: { label: "Overcast", icon: "\u2601\uFE0F" },
  45: { label: "Foggy", icon: "\u{1F32B}\uFE0F" },
  48: { label: "Depositing fog", icon: "\u{1F32B}\uFE0F" },
  51: { label: "Light drizzle", icon: "\u{1F326}\uFE0F" },
  53: { label: "Moderate drizzle", icon: "\u{1F326}\uFE0F" },
  55: { label: "Dense drizzle", icon: "\u{1F327}\uFE0F" },
  61: { label: "Slight rain", icon: "\u{1F327}\uFE0F" },
  63: { label: "Moderate rain", icon: "\u{1F327}\uFE0F" },
  65: { label: "Heavy rain", icon: "\u{1F327}\uFE0F" },
  80: { label: "Slight showers", icon: "\u{1F326}\uFE0F" },
  81: { label: "Moderate showers", icon: "\u{1F327}\uFE0F" },
  82: { label: "Heavy showers", icon: "\u{1F327}\uFE0F" },
  95: { label: "Thunderstorm", icon: "\u26C8\uFE0F" },
  96: { label: "Thunderstorm + hail", icon: "\u26C8\uFE0F" },
  99: { label: "Severe thunderstorm", icon: "\u26C8\uFE0F" },
};

interface DistrictWeather {
  name: string;
  nameEn: string;
  slug: string;
  temp: number;
  tempMin: number;
  tempMax: number;
  weatherCode: number;
  humidity: number;
  windSpeed: number;
  uvIndex: number;
  precipitation: number;
}

const tips = [
  {
    title: "వ్యవసాయ సూచనలు",
    titleEn: "Agriculture Tips",
    icon: "\u{1F33E}",
    color: "#16a34a",
    items: [
      { condition: "temp > 40", text: "అధిక ఉష్ణోగ్రతలు - పంటలకు నీటి సరఫరా పెంచండి. ఉదయం/సాయంత్రం పనులు చేయండి." },
      { condition: "rain", text: "వర్షం అంచనా - పురుగుమందులు చల్లవద్దు. నీటి పారుదల ఏర్పాట్లు తనిఖీ చేయండి." },
      { condition: "default", text: "సాధారణ వాతావరణం - పంట పరిస్థితులు అనుకూలంగా ఉన్నాయి. సకాలంలో ఎరువులు వేయండి." },
    ],
  },
  {
    title: "ఆరోగ్య సూచనలు",
    titleEn: "Health Advisory",
    icon: "\u{1F3E5}",
    color: "#dc2626",
    items: [
      { condition: "uv > 8", text: "UV సూచిక చాలా ఎక్కువగా ఉంది. బయటకు వెళ్ళేటప్పుడు సన్‌స్క్రీన్ వాడండి, టోపీ ధరించండి." },
      { condition: "temp > 38", text: "వేడి వాతావరణం - పుష్కలంగా నీరు తాగండి. హీట్ స్ట్రోక్ లక్షణాలు గమనించండి." },
      { condition: "humidity > 80", text: "అధిక తేమ - డీహైడ్రేషన్ ప్రమాదం. మధ్యాహ్నం ఎండలో బయటకు వెళ్ళకండి." },
      { condition: "default", text: "వాతావరణం సాధారణంగా ఉంది. రోజూ 8 గ్లాసుల నీరు తాగండి." },
    ],
  },
  {
    title: "ప్రయాణ సూచనలు",
    titleEn: "Travel Advisory",
    icon: "\u{1F697}",
    color: "#2563eb",
    items: [
      { condition: "rain", text: "వర్షపు వాతావరణం - రహదారులపై నీరు నిలిచే ప్రాంతాలను గమనించండి. నెమ్మదిగా డ్రైవ్ చేయండి." },
      { condition: "fog", text: "పొగమంచు - తక్కువ విజిబిలిటీ. ఫాగ్ లైట్లు వాడండి." },
      { condition: "default", text: "ప్రయాణానికి అనువైన వాతావరణం. సురక్షితంగా ప్రయాణించండి." },
    ],
  },
  {
    title: "UV సూచిక",
    titleEn: "UV Index Guide",
    icon: "\u2600\uFE0F",
    color: "#ea580c",
    items: [
      { condition: "always", text: "0-2: తక్కువ | 3-5: మితం | 6-7: ఎక్కువ | 8-10: చాలా ఎక్కువ | 11+: తీవ్రం" },
      { condition: "always", text: "UV 6+ ఉంటే: సన్‌స్క్రీన్ SPF 30+, గొడుగు/టోపీ, 10AM-4PM ఎండలో ఉండకండి." },
    ],
  },
];

const relatedPages = [
  { name: "వ్యవసాయం", nameEn: "Agriculture", slug: "/agriculture", icon: "\u{1F33E}", desc: "పంటలు, ధరలు, మార్కెట్ సమాచారం" },
  { name: "ఆరోగ్యం", nameEn: "Health", slug: "/health", icon: "\u{1F3E5}", desc: "వైద్య సలహాలు, ఆసుపత్రి వార్తలు" },
  { name: "క్రీడలు", nameEn: "Sports", slug: "/sports", icon: "\u26BD", desc: "క్రీడా వార్తలు, ఫలితాలు" },
  { name: "విద్య", nameEn: "Education", slug: "/education", icon: "\u{1F393}", desc: "పరీక్షలు, ఫలితాలు, స్కాలర్‌షిప్‌లు" },
  { name: "రాశి ఫలాలు", nameEn: "Horoscope", slug: "/rasi-phalalu", icon: "\u2B50", desc: "నేటి రాశి ఫలాలు" },
  { name: "NRI వార్తలు", nameEn: "NRI News", slug: "/nri", icon: "\u{1F30D}", desc: "ప్రవాస భారతీయుల వార్తలు" },
];

export default function WeatherPage() {
  const [weatherData, setWeatherData] = useState<DistrictWeather[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.json())
      .then((res) => {
        if (res.districts) {
          setWeatherData(res.districts.map((d: any) => ({
            name: d.name,
            nameEn: d.nameEn,
            slug: d.slug,
            temp: d.current.temp,
            tempMin: d.daily.tempMin[0],
            tempMax: d.daily.tempMax[0],
            weatherCode: d.current.weatherCode,
            humidity: d.current.humidity,
            windSpeed: d.current.windSpeed,
            uvIndex: d.current.uvIndex,
            precipitation: d.daily.precipitation?.[0] || 0,
          })));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const avgTemp = weatherData.length ? Math.round(weatherData.reduce((s, w) => s + w.temp, 0) / weatherData.length) : 0;
  const maxUV = weatherData.length ? Math.max(...weatherData.map((w) => w.uvIndex)) : 0;
  const hasRain = weatherData.some((w) => w.precipitation > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(w.weatherCode));

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 12px" }}>
        {/* Page Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg, #3b82f6, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
            {"\u{1F324}\uFE0F"}
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111" }}>రాయలసీమ వాతావరణం</h1>
            <p style={{ fontSize: 13, color: "#888" }}>Rayalaseema Weather - All 8 Districts Live</p>
          </div>
        </div>

        {/* Weather Cards Grid */}
        {loading ? (
          <p style={{ textAlign: "center", padding: 40, color: "#aaa" }}>Loading weather data...</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 32 }}>
            {weatherData.map((w) => {
              const info = weatherCodes[w.weatherCode] || weatherCodes[0];
              return (
                <Link key={w.nameEn} href={`/${w.slug}`} style={{ textDecoration: "none" }}>
                  <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", transition: "box-shadow 0.15s, transform 0.15s" }} className="hover:shadow-lg hover:-translate-y-0.5">
                    {/* District name + icon */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>{w.name}</h3>
                        <p style={{ fontSize: 11, color: "#888" }}>{w.nameEn}</p>
                      </div>
                      <span style={{ fontSize: 36 }}>{info.icon}</span>
                    </div>
                    {/* Temperature */}
                    <div style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 36, fontWeight: 900, color: "#111" }}>{w.temp}°C</span>
                      <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>{w.tempMin}° / {w.tempMax}°</span>
                    </div>
                    <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{info.label}</p>
                    {/* Details row */}
                    <div style={{ display: "flex", gap: 12, marginTop: 10, paddingTop: 10, borderTop: "1px solid #f3f4f6" }}>
                      <div style={{ fontSize: 11, color: "#888" }}>
                        <span style={{ fontWeight: 700 }}>{w.humidity}%</span> Humidity
                      </div>
                      <div style={{ fontSize: 11, color: "#888" }}>
                        <span style={{ fontWeight: 700 }}>{w.windSpeed}</span> km/h Wind
                      </div>
                      <div style={{ fontSize: 11, color: w.uvIndex >= 8 ? "#dc2626" : w.uvIndex >= 6 ? "#ea580c" : "#888" }}>
                        UV <span style={{ fontWeight: 700 }}>{w.uvIndex}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Advisory Cards */}
        <h2 style={{ fontSize: 20, fontWeight: 900, color: "#111", marginBottom: 16 }}>సూచనలు & సలహాలు</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginBottom: 32 }}>
          {tips.map((tip) => (
            <div key={tip.titleEn} style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderLeft: `4px solid ${tip.color}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>{tip.icon}</span>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: tip.color }}>{tip.title}</h3>
              </div>
              {tip.items.map((item, i) => {
                // Simple condition matching
                const show =
                  item.condition === "always" ||
                  item.condition === "default" ||
                  (item.condition === "rain" && hasRain) ||
                  (item.condition === "temp > 40" && avgTemp > 40) ||
                  (item.condition === "temp > 38" && avgTemp > 38) ||
                  (item.condition === "uv > 8" && maxUV > 8) ||
                  (item.condition === "humidity > 80" && weatherData.some((w) => w.humidity > 80)) ||
                  (item.condition === "fog" && weatherData.some((w) => [45, 48].includes(w.weatherCode)));

                if (!show && item.condition !== "default") return null;
                return (
                  <p key={i} style={{ fontSize: 13, color: "#444", lineHeight: 1.8, marginBottom: 6 }}>
                    {item.text}
                  </p>
                );
              })}
            </div>
          ))}
        </div>

        {/* Related Pages */}
        <h2 style={{ fontSize: 20, fontWeight: 900, color: "#111", marginBottom: 16 }}>సంబంధిత పేజీలు</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 32 }}>
          {relatedPages.map((p) => (
            <Link key={p.slug} href={p.slug} style={{ textDecoration: "none" }}>
              <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 2px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", gap: 12, transition: "box-shadow 0.15s" }} className="hover:shadow-md">
                <span style={{ fontSize: 28 }}>{p.icon}</span>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>{p.name}</h4>
                  <p style={{ fontSize: 11, color: "#888" }}>{p.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
