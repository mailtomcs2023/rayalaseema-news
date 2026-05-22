"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";

type SettingField = {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  options?: string[];
};

const sections: { title: string; icon: string; fields: SettingField[] }[] = [
  {
    title: "Branding",
    icon: "🎨",
    fields: [
      { key: "site_title", label: "Site Title", type: "text", placeholder: "రాయలసీమ ఎక్స్‌ప్రెస్" },
      { key: "site_description", label: "Site Description", type: "text", placeholder: "రాయలసీమ ప్రాంతం నుండి తాజా వార్తలు" },
      { key: "brand_color", label: "Brand Color", type: "color" },
      { key: "logo_url", label: "Logo URL", type: "text", placeholder: "https://..." },
    ],
  },
  {
    title: "Homepage Layout",
    icon: "🏠",
    fields: [
      { key: "homepage_layout", label: "Layout Style", type: "select", options: ["eenadu", "classic", "magazine"] },
      { key: "slider_count", label: "Slider Articles Count", type: "number", placeholder: "6" },
      { key: "ticker_speed", label: "Ticker Speed (seconds)", type: "number", placeholder: "30" },
    ],
  },
  {
    title: "Contact Information",
    icon: "📞",
    fields: [
      { key: "contact_email", label: "Contact Email", type: "text", placeholder: "info@rayalaseemaexpress.com" },
      { key: "contact_phone", label: "Contact Phone", type: "text", placeholder: "+91 ..." },
      { key: "contact_address", label: "Office Address", type: "text", placeholder: "Kurnool, Andhra Pradesh" },
    ],
  },
  {
    title: "Social Media URLs",
    icon: "🌐",
    fields: [
      { key: "facebook_url", label: "Facebook Page", type: "text", placeholder: "https://facebook.com/..." },
      { key: "twitter_url", label: "Twitter / X", type: "text", placeholder: "https://x.com/..." },
      { key: "youtube_url", label: "YouTube Channel", type: "text", placeholder: "https://youtube.com/..." },
      { key: "instagram_url", label: "Instagram", type: "text", placeholder: "https://instagram.com/..." },
      { key: "whatsapp_number", label: "WhatsApp Number", type: "text", placeholder: "919876543210" },
      { key: "telegram_url", label: "Telegram Channel", type: "text", placeholder: "https://t.me/..." },
      { key: "pinterest_url", label: "Pinterest", type: "text", placeholder: "https://pinterest.com/..." },
    ],
  },
  {
    title: "SEO & Analytics",
    icon: "📊",
    fields: [
      { key: "google_analytics_id", label: "Google Analytics ID", type: "text", placeholder: "G-XXXXXXXXXX" },
      { key: "google_adsense_id", label: "Google AdSense Publisher ID", type: "text", placeholder: "ca-pub-XXXXXXXXXX" },
      { key: "meta_keywords", label: "Default Meta Keywords", type: "text", placeholder: "Telugu news, Rayalaseema, Kurnool..." },
      { key: "onesignal_app_id", label: "OneSignal App ID", type: "text", placeholder: "From onesignal.com dashboard" },
    ],
  },
  {
    title: "Google AdSense Slot IDs",
    icon: "💰",
    fields: [
      { key: "adsense_slot_header", label: "Header Leaderboard (728x90)", type: "text", placeholder: "1234567890" },
      { key: "adsense_slot_banner_mid", label: "Below Slider Banner", type: "text", placeholder: "1234567890" },
      { key: "adsense_slot_sidebar", label: "Sidebar Rectangle (300x250)", type: "text", placeholder: "1234567890" },
      { key: "adsense_slot_sidebar_sticky", label: "Sidebar Sticky (300x600)", type: "text", placeholder: "1234567890" },
      { key: "adsense_slot_in_feed", label: "In-Feed (between sections)", type: "text", placeholder: "1234567890" },
      { key: "adsense_slot_in_article", label: "In-Article", type: "text", placeholder: "1234567890" },
      { key: "adsense_slot_mobile_anchor", label: "Mobile Anchor (sticky bottom)", type: "text", placeholder: "1234567890" },
    ],
  },
  {
    title: "Social Media API Keys (for auto-posting)",
    icon: "🔑",
    fields: [
      { key: "telegram_bot_token", label: "Telegram Bot Token", type: "password", placeholder: "From @BotFather" },
      { key: "telegram_channel_id", label: "Telegram Channel ID", type: "text", placeholder: "@channelname or -100..." },
      { key: "twitter_api_key", label: "Twitter API Key", type: "password", placeholder: "From developer.x.com" },
      { key: "twitter_api_secret", label: "Twitter API Secret", type: "password", placeholder: "" },
      { key: "twitter_access_token", label: "Twitter Access Token", type: "password", placeholder: "" },
      { key: "twitter_access_secret", label: "Twitter Access Secret", type: "password", placeholder: "" },
      { key: "facebook_page_id", label: "Facebook Page ID", type: "text", placeholder: "" },
      { key: "facebook_page_token", label: "Facebook Page Token", type: "password", placeholder: "Long-lived token" },
      { key: "linkedin_access_token", label: "LinkedIn Access Token", type: "password", placeholder: "" },
      { key: "linkedin_org_id", label: "LinkedIn Organization ID", type: "text", placeholder: "" },
    ],
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((data) => {
      setSettings(data);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const update = (key: string, value: string) => setSettings((prev) => ({ ...prev, [key]: value }));

  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#888" }}>Loading settings...</p>
      </main>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 24, position: "sticky", top: 0, background: "#f3f4f6", zIndex: 10, padding: "8px 0" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>Site Settings</h1>
            <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Configure your newspaper portal - all changes apply to frontend</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {saved && <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600, background: "#dcfce7", padding: "4px 12px", borderRadius: 6 }}>Saved!</span>}
            <button onClick={handleSave} disabled={saving} style={{
              padding: "10px 28px", background: saving ? "#999" : "#FF2C2C", color: "#fff",
              borderRadius: 8, fontSize: 14, fontWeight: 700, border: "none", cursor: saving ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(255,44,44,0.3)",
            }}>
              {saving ? "Saving..." : "Save All Settings"}
            </button>
          </div>
        </div>

        {/* Settings Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {sections.map((section) => (
            <div key={section.title} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
              {/* Section Header */}
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{section.icon}</span>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{section.title}</h2>
              </div>
              {/* Fields */}
              <div className="admin-form-grid" style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {section.fields.map((f) => (
                  <div key={f.key} style={f.type === "text" && f.key.includes("description") ? { gridColumn: "1 / -1" } : {}}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>{f.label}</label>
                    {f.type === "color" ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="color" value={settings[f.key] || "#FF2C2C"} onChange={(e) => update(f.key, e.target.value)}
                          style={{ width: 44, height: 38, border: "1px solid #e5e7eb", borderRadius: 8, cursor: "pointer", padding: 2 }} />
                        <input type="text" value={settings[f.key] || ""} onChange={(e) => update(f.key, e.target.value)}
                          style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }} />
                      </div>
                    ) : f.type === "select" ? (
                      <select value={settings[f.key] || f.options?.[0] || ""} onChange={(e) => update(f.key, e.target.value)}
                        style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" }}>
                        {f.options?.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                      </select>
                    ) : f.type === "password" ? (
                      <input
                        type="password"
                        value={settings[f.key] || ""}
                        onChange={(e) => update(f.key, e.target.value)}
                        placeholder={f.placeholder || ""}
                        style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "monospace" }}
                      />
                    ) : (
                      <input
                        type={f.type === "number" ? "number" : "text"}
                        value={settings[f.key] || ""}
                        onChange={(e) => update(f.key, e.target.value)}
                        placeholder={f.placeholder || ""}
                        style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
