"use client";

import { useState, useEffect, useRef } from "react";

// `slug` stays as the GA-event identifier (stable across the URL migration).
// `articleUrl` is the canonical share URL the WhatsApp nudge points at - caller
// passes `${siteUrl}${articleHref(article)}`.
export function ScrollShareNudge({ title, slug, articleUrl }: { title: string; slug: string; articleUrl?: string }) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      if (firedRef.current || dismissed) return;

      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = window.scrollY;
      const percentage = Math.round((scrolled / scrollHeight) * 100);

      // Fire GA4 events at milestones
      if (typeof (window as any).gtag === "function") {
        if (percentage >= 25 && percentage < 30) (window as any).gtag("event", "scroll_depth", { depth: 25, article: slug });
        if (percentage >= 50 && percentage < 55) (window as any).gtag("event", "scroll_depth", { depth: 50, article: slug });
        if (percentage >= 75 && percentage < 80) (window as any).gtag("event", "scroll_depth", { depth: 75, article: slug });
      }

      // Show WhatsApp nudge at 80%
      if (percentage >= 80 && !firedRef.current) {
        firedRef.current = true;
        setShow(true);

        if (typeof (window as any).gtag === "function") {
          (window as any).gtag("event", "engaged_reader", { article: slug });
        }

        // Auto-dismiss after 8 seconds
        setTimeout(() => setShow(false), 8000);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [slug, dismissed]);

  if (!show || dismissed) return null;

  // Prefer the canonical articleUrl passed in by the parent (built via
  // articleHref so URL pattern lives in one place). Fall back to the legacy
  // /article/<slug> path - middleware will 301 to canonical, costing one
  // extra hop only on shares from very old client bundles.
  const origin = typeof window !== "undefined" ? window.location.origin : "https://rayalaseemanews.com";
  const shareUrl = (articleUrl || `${origin}/article/${slug}`) + "?utm_source=whatsapp&utm_medium=share_nudge";
  const shareText = `${title}\n\n${shareUrl}\n\nRayalaseema News లో చదవండి`;
  const waLink = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div style={{
      // Sit ABOVE the persistent WhatsAppFloat button (bottom:80, 56px tall)
      // so the two don't overlap into a jumbled stack in the corner.
      position: "fixed", bottom: 150, right: 16, zIndex: 9995,
      animation: "nudgeSlide 0.4s ease-out",
    }}>
      <div style={{
        background: "#25D366", borderRadius: 14, padding: "10px 12px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
        display: "flex", alignItems: "center", gap: 10, maxWidth: 320,
      }}>
        <a href={waLink} target="_blank" rel="noopener noreferrer" style={{
          display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "#fff", minWidth: 0,
        }}>
          <svg width="26" height="26" fill="#fff" viewBox="0 0 24 24" style={{ flexShrink: 0 }} aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          </svg>
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>ఇది షేర్ చేయండి!</span>
            <span style={{ fontSize: 11, opacity: 0.9 }}>వాట్సాప్ గ్రూపుల్లో పంపండి</span>
          </span>
        </a>
        <button onClick={() => { setDismissed(true); setShow(false); }} aria-label="మూసివేయి" style={{
          background: "rgba(255,255,255,0.25)", border: "none", borderRadius: "50%",
          width: 22, height: 22, cursor: "pointer", color: "#fff", fontSize: 12, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          ✕
        </button>
      </div>

      <style>{`
        @keyframes nudgeSlide {
          from { transform: translateX(100px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
