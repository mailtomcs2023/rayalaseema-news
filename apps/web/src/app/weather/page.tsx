"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CloudSun, Lightbulb, LayoutGrid } from "lucide-react";
import {
  Sun1, CloudSunny, Cloud, CloudFog, CloudDrizzle, CloudLightning,
  Tree, Health, Car, Cup, Teacher, Star1, Global,
} from "iconsax-reactjs";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { SectionHeading } from "@/components/section-heading";

type IconType = typeof Sun1;

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

const weatherCodes: Record<number, { label: string; Icon: IconType; color: string }> = {
  0: { label: "Clear sky", Icon: Sun1, color: "#f59e0b" },
  1: { label: "Mainly clear", Icon: Sun1, color: "#f59e0b" },
  2: { label: "Partly cloudy", Icon: CloudSunny, color: "#f59e0b" },
  3: { label: "Overcast", Icon: Cloud, color: "#64748b" },
  45: { label: "Foggy", Icon: CloudFog, color: "#64748b" },
  48: { label: "Depositing fog", Icon: CloudFog, color: "#64748b" },
  51: { label: "Light drizzle", Icon: CloudDrizzle, color: "#3b82f6" },
  53: { label: "Moderate drizzle", Icon: CloudDrizzle, color: "#3b82f6" },
  55: { label: "Dense drizzle", Icon: CloudDrizzle, color: "#2563eb" },
  61: { label: "Slight rain", Icon: CloudDrizzle, color: "#2563eb" },
  63: { label: "Moderate rain", Icon: CloudDrizzle, color: "#2563eb" },
  65: { label: "Heavy rain", Icon: CloudDrizzle, color: "#1d4ed8" },
  80: { label: "Slight showers", Icon: CloudDrizzle, color: "#2563eb" },
  81: { label: "Moderate showers", Icon: CloudDrizzle, color: "#2563eb" },
  82: { label: "Heavy showers", Icon: CloudDrizzle, color: "#1d4ed8" },
  95: { label: "Thunderstorm", Icon: CloudLightning, color: "#7c3aed" },
  96: { label: "Thunderstorm + hail", Icon: CloudLightning, color: "#7c3aed" },
  99: { label: "Severe thunderstorm", Icon: CloudLightning, color: "#6d28d9" },
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

const tips: { title: string; titleEn: string; Icon: IconType; color: string; items: { condition: string; text: string }[] }[] = [
  {
    title: "వ్యవసాయ సూచనలు",
    titleEn: "Agriculture Tips",
    Icon: Tree,
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
    Icon: Health,
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
    Icon: Car,
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
    Icon: Sun1,
    color: "#ea580c",
    items: [
      { condition: "always", text: "0-2: తక్కువ | 3-5: మితం | 6-7: ఎక్కువ | 8-10: చాలా ఎక్కువ | 11+: తీవ్రం" },
      { condition: "always", text: "UV 6+ ఉంటే: సన్‌స్క్రీన్ SPF 30+, గొడుగు/టోపీ, 10AM-4PM ఎండలో ఉండకండి." },
    ],
  },
];

const relatedPages: { name: string; nameEn: string; slug: string; Icon: IconType; desc: string }[] = [
  { name: "వ్యవసాయం", nameEn: "Agriculture", slug: "/agriculture", Icon: Tree, desc: "పంటలు, ధరలు, మార్కెట్ సమాచారం" },
  { name: "ఆరోగ్యం", nameEn: "Health", slug: "/health", Icon: Health, desc: "వైద్య సలహాలు, ఆసుపత్రి వార్తలు" },
  { name: "క్రీడలు", nameEn: "Sports", slug: "/sports", Icon: Cup, desc: "క్రీడా వార్తలు, ఫలితాలు" },
  { name: "విద్య", nameEn: "Education", slug: "/education", Icon: Teacher, desc: "పరీక్షలు, ఫలితాలు, స్కాలర్‌షిప్‌లు" },
  { name: "రాశి ఫలాలు", nameEn: "Horoscope", slug: "/horoscope", Icon: Star1, desc: "నేటి రాశి ఫలాలు" },
  { name: "NRI వార్తలు", nameEn: "NRI News", slug: "/nri", Icon: Global, desc: "ప్రవాస భారతీయుల వార్తలు" },
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
      <Header />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 12px 44px" }}>
        {/* Page title */}
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "var(--n-900)", lineHeight: 1.2 }}>రాయలసీమ వాతావరణం</h1>
          <p style={{ fontSize: 13, color: "var(--n-500)", marginTop: 2 }}>8 జిల్లాల ప్రత్యక్ష వాతావరణ సమాచారం · Rayalaseema Weather Live</p>
        </div>

        {/* District weather cards */}
        <div style={{ marginBottom: 12 }}>
          <SectionHeading title="జిల్లాల వాతావరణం" icon={CloudSun} />
        </div>
        {loading ? (
          <p style={{ textAlign: "center", padding: 40, color: "var(--n-500)" }}>వాతావరణ సమాచారం లోడ్ అవుతోంది…</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 32 }}>
            {weatherData.map((w) => {
              const info = weatherCodes[w.weatherCode] || weatherCodes[0];
              const WIcon = info.Icon;
              return (
                <Link key={w.nameEn} href={`/${w.slug}`} className="wx-card" style={{ textDecoration: "none" }}>
                  {/* District name + icon */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--n-900)" }}>{w.name}</h3>
                      <p style={{ fontSize: 11, color: "var(--n-500)" }}>{w.nameEn}</p>
                    </div>
                    <WIcon size={38} color={info.color} variant="Bulk" />
                  </div>
                  {/* Temperature */}
                  <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 34, fontWeight: 900, color: "var(--n-900)" }}>{w.temp}°C</span>
                    <span style={{ fontSize: 12, color: "var(--n-500)" }}>{w.tempMin}° / {w.tempMax}°</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--n-700)", marginTop: 2 }}>{info.label}</p>
                  {/* Details row */}
                  <div style={{ display: "flex", gap: 12, marginTop: 12, paddingTop: 10, borderTop: "1px solid #eef0f2" }}>
                    <div style={{ fontSize: 11, color: "var(--n-500)" }}>
                      <span style={{ fontWeight: 700, color: "var(--n-900)" }}>{w.humidity}%</span> తేమ
                    </div>
                    <div style={{ fontSize: 11, color: "var(--n-500)" }}>
                      <span style={{ fontWeight: 700, color: "var(--n-900)" }}>{w.windSpeed}</span> km/h గాలి
                    </div>
                    <div style={{ fontSize: 11, color: w.uvIndex >= 8 ? "#dc2626" : w.uvIndex >= 6 ? "#ea580c" : "var(--n-500)" }}>
                      UV <span style={{ fontWeight: 700 }}>{w.uvIndex}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Advisory cards */}
        <div style={{ marginBottom: 12 }}>
          <SectionHeading title="సూచనలు & సలహాలు" icon={Lightbulb} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginBottom: 32 }}>
          {tips.map((tip) => {
            const TIcon = tip.Icon;
            return (
              <div key={tip.titleEn} style={{ background: "#fff", borderRadius: 8, padding: 16, border: "1px solid #e5e7eb" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: `${tip.color}14`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <TIcon size={19} color={tip.color} variant="Bulk" />
                  </span>
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: tip.color }}>{tip.title}</h3>
                </div>
                {tip.items.map((item, i) => {
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
                    <p key={i} style={{ fontSize: 13, color: "var(--n-700)", lineHeight: 1.8, marginBottom: 6 }}>
                      {item.text}
                    </p>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Related pages */}
        <div style={{ marginBottom: 12 }}>
          <SectionHeading title="సంబంధిత పేజీలు" icon={LayoutGrid} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {relatedPages.map((p) => {
            const PIcon = p.Icon;
            return (
              <Link key={p.slug} href={p.slug} className="wx-link" style={{ textDecoration: "none" }}>
                <span style={{ width: 40, height: 40, borderRadius: 8, background: "var(--brand-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <PIcon size={22} color="#E01B1B" variant="Bulk" />
                </span>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: "var(--n-900)" }}>{p.name}</h4>
                  <p style={{ fontSize: 11, color: "var(--n-500)" }}>{p.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
      <Footer />

      <style>{`
        .wx-card {
          display: block;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          transition: border-color 0.15s;
        }
        .wx-card:hover { border-color: var(--brand); }
        .wx-link {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px;
          transition: border-color 0.15s;
        }
        .wx-link:hover { border-color: var(--brand); }
      `}</style>
    </div>
  );
}
