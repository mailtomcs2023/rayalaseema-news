"use client";

import { useState } from "react";

interface Props {
  title: string;
  slug: string;
  siteUrl: string;
  body: string;
  featuredImage?: string | null;
  deskName?: string | null;
}

/**
 * Generates a 1080x1080 share card PNG via the Canvas API:
 *   - red brand strip top: "రాయలసీమ ఎక్స్‌ప్రెస్"
 *   - featured image (or red fallback) in middle
 *   - headline overlay + desk + URL at bottom
 *
 * Returns null if image can't be loaded due to CORS so the caller can fall back.
 */
async function buildShareCard({
  title, featuredImage, deskName, articleUrl,
}: { title: string; featuredImage?: string | null; deskName?: string | null; articleUrl: string }): Promise<Blob | null> {
  const SIZE = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Brand strip (top)
  const stripH = 90;
  ctx.fillStyle = "#E01B1B";
  ctx.fillRect(0, 0, SIZE, stripH);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 42px 'Noto Serif Telugu', serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("రాయలసీమ ఎక్స్‌ప్రెస్", 40, stripH / 2);
  ctx.font = "600 22px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("rayalaseemaexpress.com", SIZE - 40, stripH / 2);

  // Featured image (or solid fallback)
  const imgY = stripH;
  const imgH = 620;
  if (featuredImage) {
    try {
      const img = await loadImg(featuredImage);
      // Cover fit
      const ratio = Math.max(SIZE / img.width, imgH / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      const x = (SIZE - w) / 2;
      const y = imgY + (imgH - h) / 2;
      ctx.drawImage(img, x, y, w, h);
    } catch {
      // CORS/load failure — fall through to solid fallback
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, imgY, SIZE, imgH);
      ctx.fillStyle = "#9ca3af";
      ctx.font = "bold 60px 'Ramabhadra', serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("రాయలసీమ ఎక్స్‌ప్రెస్", SIZE / 2, imgY + imgH / 2);
    }
  } else {
    // Branded fallback
    ctx.fillStyle = "#fef2f2";
    ctx.fillRect(0, imgY, SIZE, imgH);
    ctx.fillStyle = "#E01B1B";
    ctx.font = "bold 80px 'Ramabhadra', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("రాయలసీమ ఎక్స్‌ప్రెస్", SIZE / 2, imgY + imgH / 2);
  }

  // Headline area (bottom block)
  const blockY = stripH + imgH;
  const blockH = SIZE - blockY;
  ctx.fillStyle = "#0b0b0b";
  ctx.fillRect(0, blockY, SIZE, blockH);

  // Headline (wrap)
  ctx.fillStyle = "#fff";
  ctx.font = "bold 44px 'Noto Serif Telugu', serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const lines = wrapText(ctx, title, SIZE - 80, 4);
  let y = blockY + 30;
  for (const line of lines) {
    ctx.fillText(line, 40, y);
    y += 56;
  }

  // Desk byline + URL
  ctx.font = "600 22px 'Noto Sans Telugu', sans-serif";
  ctx.fillStyle = "#fbbf24";
  if (deskName) ctx.fillText(`— ${deskName}`, 40, SIZE - 70);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 20px sans-serif";
  ctx.fillText(articleUrl.replace(/^https?:\/\//, ""), 40, SIZE - 40);

  return await canvasToBlob(canvas);
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function canvasToBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((r) => c.toBlob((b) => r(b), "image/png", 0.92));
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const last = lines[maxLines - 1];
    lines.length = maxLines;
    lines[maxLines - 1] = last.replace(/\s+\S+$/, "") + "…";
  }
  return lines;
}

export function ShareBar({ title, slug, siteUrl, body: _body, featuredImage, deskName }: Props) {
  const [sharing, setSharing] = useState(false);
  const articleUrl = `${siteUrl}/article/${slug}`;
  const waText = `${title}\n\n${articleUrl}?utm_source=whatsapp\n\nరాయలసీమ ఎక్స్‌ప్రెస్ లో చదవండి`;

  const handleNativeShare = async () => {
    setSharing(true);
    try {
      const blob = await buildShareCard({ title, featuredImage, deskName, articleUrl });
      const file = blob ? new File([blob], `rayalaseema-${slug}.png`, { type: "image/png" }) : null;

      // Try Web Share API with file (mobile + recent Chrome)
      if (file && typeof navigator !== "undefined" && (navigator as any).canShare?.({ files: [file] })) {
        await (navigator as any).share({ files: [file], title, text: title, url: articleUrl });
        return;
      }
      // URL-only share fallback
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text: title, url: articleUrl });
        return;
      }
      // Desktop fallback — open WhatsApp Web with text
      window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, "_blank", "noopener,noreferrer");
    } catch {
      // user cancelled or browser blocked — silent
    } finally {
      setSharing(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 10, padding: "12px 0", borderBottom: "1px solid #eee", alignItems: "center", flexWrap: "wrap" }}>
      {/* Primary share — generates image clip, opens native share sheet */}
      <button onClick={handleNativeShare} disabled={sharing}
        aria-label="Share with image"
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 18px",
          background: "#25D366", color: "#fff", border: "none", borderRadius: 999,
          fontSize: 14, fontWeight: 700, cursor: sharing ? "wait" : "pointer",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        }}>
        <svg width="18" height="18" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
          <path d="M16 .395a15.6 15.6 0 0 0-13.4 23.604L0 32l8.2-2.5A15.6 15.6 0 1 0 16 .395Zm0 28.4a12.9 12.9 0 0 1-6.6-1.8l-.5-.3-4.9 1.5 1.6-4.8-.3-.5a12.9 12.9 0 1 1 10.7 5.9Zm7.4-9.7c-.4-.2-2.4-1.2-2.7-1.3s-.6-.2-.9.2-1 1.3-1.3 1.5-.5.3-.9.1c-2.4-1.2-4-2.2-5.6-5-.4-.7.4-.6 1.1-2.1.1-.3 0-.5-.1-.7s-.9-2.1-1.2-2.9-.6-.7-.9-.7h-.7c-.3 0-.7.1-1.1.5s-1.4 1.4-1.4 3.4 1.5 4 1.7 4.3 2.9 4.5 7.1 6.3a23.3 23.3 0 0 0 2.3.9c1 .3 1.9.3 2.6.2.8-.1 2.4-1 2.7-1.9.3-.9.3-1.7.2-1.9-.1-.1-.4-.2-.8-.4Z"/>
        </svg>
        {sharing ? "..." : "Share"}
      </button>

      {/* Direct WhatsApp link (text only) */}
      <a href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer"
        aria-label="WhatsApp"
        style={iconStyle("#25D366")}>
        <svg width="16" height="16" fill="#fff" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 .395a15.6 15.6 0 0 0-13.4 23.604L0 32l8.2-2.5A15.6 15.6 0 1 0 16 .395Zm0 28.4a12.9 12.9 0 0 1-6.6-1.8l-.5-.3-4.9 1.5 1.6-4.8-.3-.5a12.9 12.9 0 1 1 10.7 5.9Zm7.4-9.7c-.4-.2-2.4-1.2-2.7-1.3s-.6-.2-.9.2-1 1.3-1.3 1.5-.5.3-.9.1c-2.4-1.2-4-2.2-5.6-5-.4-.7.4-.6 1.1-2.1.1-.3 0-.5-.1-.7s-.9-2.1-1.2-2.9-.6-.7-.9-.7h-.7c-.3 0-.7.1-1.1.5s-1.4 1.4-1.4 3.4 1.5 4 1.7 4.3 2.9 4.5 7.1 6.3a23.3 23.3 0 0 0 2.3.9c1 .3 1.9.3 2.6.2.8-.1 2.4-1 2.7-1.9.3-.9.3-1.7.2-1.9-.1-.1-.4-.2-.8-.4Z"/>
        </svg>
      </a>

      <div style={{ flex: 1 }} />

      {/* Facebook */}
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`} target="_blank" rel="noopener noreferrer"
        aria-label="Facebook" style={iconStyle("#1877F2")}>
        <svg width="16" height="16" fill="#fff" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      </a>

      {/* X / Twitter */}
      <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(articleUrl)}`} target="_blank" rel="noopener noreferrer"
        aria-label="X" style={iconStyle("#000")}>
        <svg width="14" height="14" fill="#fff" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      </a>

      {/* Telegram */}
      <a href={`https://t.me/share/url?url=${encodeURIComponent(articleUrl)}&text=${encodeURIComponent(title)}`} target="_blank" rel="noopener noreferrer"
        aria-label="Telegram" style={iconStyle("#0088cc")}>
        <svg width="14" height="14" fill="#fff" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
      </a>

      {/* Copy */}
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
