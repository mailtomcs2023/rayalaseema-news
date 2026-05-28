"use client";

import { useState } from "react";

interface Props {
  title: string;
  // Canonical article URL - caller passes `${siteUrl}${articleHref(article)}`.
  // Replaced the older { slug, siteUrl } pair so URL pattern lives in one
  // place (apps/web/src/lib/article-href.ts) - Phase A0 URL migration.
  articleUrl: string;
  body?: string;
  featuredImage?: string | null;
  deskName?: string | null;
}

/**
 * Single primary Share button + secondary platform icons.
 *
 * The primary button calls `navigator.share({ url, title, text })` - URL only.
 * WhatsApp / Telegram / Insta on mobile each render their own preview card
 * driven by the article's OG meta tags (og:image, og:title, og:description),
 * so the reader sees a thumbnail of the featured image without us doing any
 * canvas screenshotting on click.
 *
 * That keeps the share tap instant - earlier the client was painting a 1080×1080
 * PNG via Canvas + waiting on a cross-origin image load before opening the
 * share sheet, which felt sluggish.
 *
 * Desktop browsers without Web Share open the WhatsApp web URL as a fallback.
 */
export function ShareBar({ title, articleUrl, featuredImage: _featuredImage, deskName: _deskName }: Props) {
  const [busy, setBusy] = useState(false);
  const waText = `${title}\n\n${articleUrl}?utm_source=whatsapp\n\nరాయలసీమ ఎక్స్‌ప్రెస్ లో చదవండి`;

  const onShare = async () => {
    setBusy(true);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title, text: title, url: articleUrl });
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, "_blank", "noopener,noreferrer");
    } catch {
      // user cancelled the share sheet - silent
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 10, padding: "12px 0", borderBottom: "1px solid #eee", alignItems: "center", flexWrap: "wrap" }}>
      {/* Primary Share - opens the OS share sheet (WhatsApp/Insta/etc) on mobile,
          WhatsApp Web on desktop. WhatsApp shows the OG image preview automatically. */}
      <button onClick={onShare} disabled={busy}
        aria-label="Share article"
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 20px",
          background: "#25D366", color: "#fff", border: "none", borderRadius: 999,
          fontSize: 14, fontWeight: 700, cursor: busy ? "wait" : "pointer",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        }}>
        <svg width="18" height="18" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
          <path d="M16 .395a15.6 15.6 0 0 0-13.4 23.604L0 32l8.2-2.5A15.6 15.6 0 1 0 16 .395Zm0 28.4a12.9 12.9 0 0 1-6.6-1.8l-.5-.3-4.9 1.5 1.6-4.8-.3-.5a12.9 12.9 0 1 1 10.7 5.9Zm7.4-9.7c-.4-.2-2.4-1.2-2.7-1.3s-.6-.2-.9.2-1 1.3-1.3 1.5-.5.3-.9.1c-2.4-1.2-4-2.2-5.6-5-.4-.7.4-.6 1.1-2.1.1-.3 0-.5-.1-.7s-.9-2.1-1.2-2.9-.6-.7-.9-.7h-.7c-.3 0-.7.1-1.1.5s-1.4 1.4-1.4 3.4 1.5 4 1.7 4.3 2.9 4.5 7.1 6.3a23.3 23.3 0 0 0 2.3.9c1 .3 1.9.3 2.6.2.8-.1 2.4-1 2.7-1.9.3-.9.3-1.7.2-1.9-.1-.1-.4-.2-.8-.4Z"/>
        </svg>
        Share
      </button>

      <div style={{ flex: 1 }} />

      {/* Direct platform links (URL only - each platform shows its own preview card from our OG meta) */}
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`} target="_blank" rel="noopener noreferrer"
        aria-label="Facebook" style={iconStyle("#1877F2")}>
        <svg width="16" height="16" fill="#fff" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      </a>

      <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(articleUrl)}`} target="_blank" rel="noopener noreferrer"
        aria-label="X" style={iconStyle("#000")}>
        <svg width="14" height="14" fill="#fff" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      </a>

      <a href={`https://t.me/share/url?url=${encodeURIComponent(articleUrl)}&text=${encodeURIComponent(title)}`} target="_blank" rel="noopener noreferrer"
        aria-label="Telegram" style={iconStyle("#0088cc")}>
        <svg width="14" height="14" fill="#fff" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
      </a>

      <button onClick={() => { navigator.clipboard.writeText(articleUrl); }}
        aria-label="Copy link"
        style={{ ...iconStyle("#f3f4f6"), border: "none", cursor: "pointer" }}>
        <svg width="14" height="14" fill="none" stroke="#666" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      </button>
    </div>
  );
}

function iconStyle(bg: string): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: "50%", background: bg,
    display: "flex", alignItems: "center", justifyContent: "center",
    textDecoration: "none", flexShrink: 0,
  };
}
