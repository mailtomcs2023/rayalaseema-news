"use client";

import { useState, useEffect, useRef } from "react";

// Floating "share this story" widget. Appears once the reader is ~80% through
// the article (engaged-reader signal, also fires the GA scroll-depth events),
// then stays until shared or dismissed. Offers WhatsApp / Facebook / X /
// Telegram / copy-link, plus the native OS share sheet on devices that support
// it. `articleUrl` is the canonical URL (caller passes `${siteUrl}${articleHref(article)}`).

// Brand glyph paths (single <path> each, drawn white on a brand-colour disc).
const ICON: Record<string, string> = {
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  x: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z",
  telegram:
    "M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.27 1.37.17 1.16 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-2.16 2.1c-.25.25-.46.46-.66.25z",
  link: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  share:
    "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z",
};

function Glyph({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function ScrollShareNudge({ title, slug, articleUrl }: { title: string; slug: string; articleUrl?: string }) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNative, setCanNative] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    setCanNative(typeof navigator !== "undefined" && typeof (navigator as any).share === "function");
  }, []);

  useEffect(() => {
    // Cache scrollable height; re-measure on resize/load. rAF-throttle the
    // scroll handler so long, image-heavy articles don't reflow per event.
    let docH = 0;
    let raf = 0;
    const measure = () => { docH = document.documentElement.scrollHeight - window.innerHeight; };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    window.addEventListener("load", measure);
    const onScroll = () => {
      if (firedRef.current || dismissed) return;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (docH <= 0) return;
        const pct = Math.round((window.scrollY / docH) * 100);
        const g = (window as any).gtag;
        if (typeof g === "function") {
          if (pct >= 25 && pct < 30) g("event", "scroll_depth", { depth: 25, article: slug });
          if (pct >= 50 && pct < 55) g("event", "scroll_depth", { depth: 50, article: slug });
          if (pct >= 75 && pct < 80) g("event", "scroll_depth", { depth: 75, article: slug });
        }
        if (pct >= 80 && !firedRef.current) {
          firedRef.current = true;
          setShow(true); // stays until shared/closed - no auto-dismiss
          if (typeof g === "function") g("event", "engaged_reader", { article: slug });
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      window.removeEventListener("load", measure);
    };
  }, [slug, dismissed]);

  if (!show || dismissed) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://rayalaseemanews.com";
  const url = `${(articleUrl || `${origin}/telugu-news/${slug}`)}?utm_source=share&utm_medium=share_nudge`;
  const enc = encodeURIComponent;
  const waText = `${title}\n\n${url}\n\nRayalaseema News లో చదవండి`;

  const links = [
    { key: "whatsapp", label: "WhatsApp", bg: "#25D366", href: `https://wa.me/?text=${enc(waText)}` },
    { key: "facebook", label: "Facebook", bg: "#1877F2", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { key: "x", label: "X (Twitter)", bg: "#0f1419", href: `https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(url)}` },
    { key: "telegram", label: "Telegram", bg: "#229ED9", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}` },
  ] as const;

  const track = (method: string) => {
    const g = (window as any).gtag;
    if (typeof g === "function") g("event", "share", { method, content_type: "article", item_id: slug });
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    track("copy_link");
    window.setTimeout(() => setCopied(false), 2200);
  };

  const onNative = async () => {
    try { await (navigator as any).share({ title, text: title, url }); track("native"); } catch {}
  };

  return (
    <div className="ssn" role="dialog" aria-label="ఈ వార్తను షేర్ చేయండి">
      <button className="ssn-x" onClick={() => setDismissed(true)} aria-label="మూసివేయి" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <div className="ssn-head">
        <span className="ssn-badge" aria-hidden="true"><Glyph d={ICON.share} size={16} /></span>
        <div className="ssn-text">
          <div className="ssn-title">ఈ వార్తను షేర్ చేయండి</div>
          <div className="ssn-sub">మీ స్నేహితులకు పంపండి</div>
        </div>
      </div>

      <div className="ssn-row">
        {links.map((l) => (
          <a
            key={l.key}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="ssn-btn"
            style={{ background: l.bg }}
            aria-label={l.label}
            title={l.label}
            onClick={() => track(l.key)}
          >
            <Glyph d={ICON[l.key]} />
          </a>
        ))}
        <button
          type="button"
          className={`ssn-btn ssn-copy${copied ? " is-ok" : ""}`}
          onClick={onCopy}
          aria-label={copied ? "లింక్ కాపీ అయింది" : "లింక్ కాపీ చేయండి"}
          title={copied ? "Copied" : "Copy link"}
        >
          <Glyph d={copied ? ICON.check : ICON.link} />
        </button>
        {canNative && (
          <button type="button" className="ssn-btn ssn-more" onClick={onNative} aria-label="మరిన్ని ఆప్షన్‌లు" title="More">
            <Glyph d={ICON.share} size={18} />
          </button>
        )}
      </div>

      <div className={`ssn-toast${copied ? " is-in" : ""}`} aria-live="polite">లింక్ కాపీ అయింది ✓</div>

      <style>{`
        .ssn {
          position: fixed; bottom: 150px; right: 16px; z-index: 9995;
          width: 300px; max-width: calc(100vw - 32px);
          background: #fff; border: 1px solid rgba(0,0,0,0.06);
          border-radius: 16px; padding: 16px 16px 14px;
          box-shadow: 0 12px 40px rgba(2,8,20,0.18), 0 2px 8px rgba(2,8,20,0.08);
          font-family: var(--font-telugu-body), system-ui, sans-serif;
          animation: ssn-in 0.32s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @media (max-width: 640px) { .ssn { right: 12px; bottom: 92px; } }
        @keyframes ssn-in {
          from { transform: translateY(14px) scale(0.96); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
        .ssn-x {
          position: absolute; top: 9px; right: 9px;
          width: 24px; height: 24px; border: none; border-radius: 50%;
          background: #f1f3f5; color: #6b7280; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s, color 0.15s;
        }
        .ssn-x:hover { background: #e5e7eb; color: #111827; }
        .ssn-head { display: flex; align-items: center; gap: 11px; margin-bottom: 14px; padding-right: 22px; }
        .ssn-badge {
          flex-shrink: 0; width: 36px; height: 36px; border-radius: 11px;
          display: flex; align-items: center; justify-content: center; color: #fff;
          background: linear-gradient(135deg, var(--brand, #E01B1B), var(--brand-dark, #B91414));
          box-shadow: 0 4px 12px rgba(224,27,27,0.32);
        }
        .ssn-title { font-size: 13.5px; font-weight: 800; color: #0f172a; line-height: 1.25; }
        .ssn-sub { font-size: 11px; color: #94a3b8; margin-top: 1px; }
        .ssn-row { display: flex; align-items: center; gap: 9px; }
        .ssn-btn {
          flex: 1 1 0; min-width: 0; height: 42px; border: none; border-radius: 11px;
          display: flex; align-items: center; justify-content: center;
          color: #fff; cursor: pointer; text-decoration: none;
          transition: transform 0.14s ease, filter 0.14s ease, box-shadow 0.14s ease;
          box-shadow: 0 2px 6px rgba(2,8,20,0.12);
        }
        .ssn-btn:hover { transform: translateY(-2px); filter: brightness(1.06); box-shadow: 0 6px 14px rgba(2,8,20,0.18); }
        .ssn-btn:active { transform: translateY(0) scale(0.95); }
        .ssn-copy { background: #475569; }
        .ssn-copy.is-ok { background: #16a34a; }
        .ssn-more { background: #0f172a; }
        .ssn-toast {
          overflow: hidden; max-height: 0; opacity: 0;
          font-size: 11.5px; font-weight: 700; color: #16a34a; text-align: center;
          transition: max-height 0.25s ease, opacity 0.25s ease, margin-top 0.25s ease;
        }
        .ssn-toast.is-in { max-height: 24px; opacity: 1; margin-top: 10px; }
      `}</style>
    </div>
  );
}
