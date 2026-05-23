"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface FooterProps {
  config?: Record<string, string>;
}

export function Footer({ config: initialConfig = {} }: FooterProps) {
  const [config, setConfig] = useState(initialConfig);

  useEffect(() => {
    if (Object.keys(config).length === 0) {
      fetch("/api/config").then((r) => r.json()).then(setConfig).catch(() => {});
    }
  }, []);
  return (
    <footer className="bg-gray-900 text-gray-300 mt-16">
      {/* Top Footer */}
      <div className="container-news py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="mb-4 bg-white rounded-lg p-2 inline-block">
              <img
                src="/logo.svg"
                alt="రాయలసీమ ఎక్స్‌ప్రెస్"
                className="h-10 w-auto"
              />
            </div>
            <p className="text-sm text-gray-400 font-telugu leading-relaxed mb-4">
              రాయలసీమ ప్రాంతం నుండి నమ్మకమైన, నిష్పక్షపాతమైన వార్తలు అందించడం మా లక్ష్యం.
              కర్నూలు, అనంతపురం, కడప, చిత్తూరు జిల్లాల వార్తలు, రాజకీయాలు, క్రీడలు, వ్యాపారం
              మరియు మరిన్ని విభాగాల్లో తాజా సమాచారం.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { name: "Facebook", bg: "#1877F2", configKey: "facebook_url", svg: '<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>' },
                { name: "Twitter", bg: "#000", configKey: "twitter_url", svg: '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>' },
                { name: "Instagram", bg: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)", configKey: "instagram_url", svg: '<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>' },
                { name: "YouTube", bg: "#FF0000", configKey: "youtube_url", svg: '<path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>' },
                { name: "WhatsApp", bg: "#25D366", configKey: "whatsapp_number", svg: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>' },
                { name: "Telegram", bg: "#0088cc", configKey: "telegram_url", svg: '<path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>' },
              ].map((s) => (
                <a
                  key={s.name}
                  href={s.configKey === "whatsapp_number" ? (config[s.configKey] ? `https://wa.me/${config[s.configKey]}` : "#") : (config[s.configKey] || "#")}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.name}
                  style={{ width: 36, height: 36, borderRadius: "50%", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.2s, opacity 0.2s" }}
                  className="hover:opacity-80 hover:scale-110"
                >
                  <svg width="16" height="16" fill="#fff" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: s.svg }} />
                </a>
              ))}
            </div>
          </div>

          {/* Rayalaseema Districts - Primary */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              రాయలసీమ జిల్లాలు
            </h4>
            <ul className="space-y-2 text-sm">
              {[
                { name: "కర్నూలు", slug: "kurnool" },
                { name: "నంద్యాల", slug: "nandyal" },
                { name: "అనంతపురం", slug: "ananthapuramu" },
                { name: "శ్రీ సత్యసాయి", slug: "sri-sathya-sai" },
                { name: "వై.యస్.ఆర్", slug: "ysr-kadapa" },
                { name: "తిరుపతి", slug: "tirupati" },
                { name: "అన్నమయ్య", slug: "annamayya" },
                { name: "చిత్తూరు", slug: "chittoor" },
              ].map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/district/${d.slug}`}
                    className="hover:text-white transition-colors font-telugu"
                  >
                    {d.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Other Sections */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              విభాగాలు
            </h4>
            <ul className="space-y-2 text-sm">
              {[
                { name: "ఆంధ్రప్రదేశ్", slug: "andhra-pradesh" },
                { name: "తెలంగాణ", slug: "telangana" },
                { name: "జాతీయం", slug: "national" },
                { name: "అంతర్జాతీయం", slug: "international" },
                { name: "క్రీడలు", slug: "sports" },
                { name: "బిజినెస్", slug: "business" },
                { name: "సినిమా", slug: "entertainment" },
                { name: "రాశి ఫలాలు", slug: "rasi-phalalu" },
                { name: "టెక్నాలజీ", slug: "technology" },
                { name: "సినిమా రివ్యూలు", slug: "movie-reviews" },
                { name: "పరీక్షా ఫలితాలు", slug: "exam-results" },
                { name: "ఉద్యోగాలు", slug: "jobs" },
                { name: "ఆరోగ్యం", slug: "health" },
                { name: "భక్తి", slug: "devotional" },
                { name: "NRI వార్తలు", slug: "nri" },
                { name: "వాతావరణం", slug: "weather" },
              ].map((cat) => (
                <li key={cat.slug}>
                  <Link
                    href={`/category/${cat.slug}`}
                    className="hover:text-white transition-colors font-telugu"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              లింకులు
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/epaper" className="hover:text-white transition-colors font-telugu">
                  ePaper
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-white transition-colors font-telugu">
                  మా గురించి
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition-colors font-telugu">
                  సంప్రదించండి
                </Link>
              </li>
              <li>
                <a href="mailto:ads@rayalaseemaexpress.com" className="hover:text-white transition-colors font-telugu">
                  ప్రకటనలు
                </a>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <a href="/sitemap.xml" className="hover:text-white transition-colors">
                  Sitemap
                </a>
              </li>
            </ul>

            {/* Download App */}
            <h4 className="text-white font-semibold mt-6 mb-3 text-sm uppercase tracking-wider">
              App Download
            </h4>
            <div className="space-y-2">
              <span className="block bg-gray-800 rounded-lg px-4 py-2.5 text-xs text-gray-500">
                App Coming Soon
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="border-t border-gray-800">
        <div className="container-news py-5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-gray-500">
          <p className="font-telugu">
            &copy; {new Date().getFullYear()} రాయలసీమ ఎక్స్‌ప్రెస్. సర్వ హక్కులు
            రిజర్వ్ చేయబడ్డాయి.
          </p>
          <p>
            Published by <span style={{ color: "#ccc" }}>Medha Publications Pvt Ltd</span> | Developed by <span style={{ color: "#ccc" }}>Medha Cloud Solutions</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
