"use client";

import { useState } from "react";
import Link from "next/link";
import type { VideoItem } from "./video-section";

function ytId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

function fmtViews(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L వీక్షణలు`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K వీక్షణలు`;
  return `${n} వీక్షణలు`;
}

/** Full video grid for the /videos hub. Click-to-play inline (YouTube iframe swap). */
export function VideoGrid({ videos }: { videos: VideoItem[] }) {
  const [playingId, setPlayingId] = useState<string | null>(null);

  if (!videos.length) {
    return <p className="vg-empty">వీడియోలు త్వరలో…</p>;
  }

  return (
    <div className="vg">
      {videos.map((v) => {
        const vid = ytId(v.videoUrl);
        return (
          <article key={v.id} className="vg-item">
            {playingId === v.id && vid ? (
              <div className="vg-frame">
                <iframe
                  src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`}
                  title={v.title}
                  allow="accelerated-fullscreen; autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <button
                className="vg-thumb"
                onClick={() => vid && setPlayingId(v.id)}
                aria-label={`Play: ${v.title}`}
              >
                <img src={v.thumbnail} alt={v.title} loading="lazy" />
                <span className="vg-play" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                </span>
                {v.duration && <span className="vg-dur">{v.duration}</span>}
              </button>
            )}
            <div className="vg-meta">
              {v.category && <span className="vg-cat">{v.category}</span>}
              <Link href={`/videos/${v.slug}`} className="vg-title">{v.title}</Link>
              <span className="vg-views">{fmtViews(v.views)}</span>
            </div>
          </article>
        );
      })}

      <style>{`
        .vg {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px 16px;
        }
        .vg-empty {
          font-family: var(--font-telugu-body), sans-serif;
          color: var(--n-500, #6b7280);
          padding: 40px 0;
          text-align: center;
        }
        .vg-item { min-width: 0; }
        .vg-frame {
          position: relative;
          width: 100%;
          aspect-ratio: 16/9;
          border-radius: 6px;
          overflow: hidden;
          background: #000;
        }
        .vg-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
        .vg-thumb {
          position: relative;
          display: block;
          width: 100%;
          padding: 0; border: 0;
          cursor: pointer;
          border-radius: 6px;
          overflow: hidden;
          background: #000;
        }
        .vg-thumb img {
          width: 100%;
          aspect-ratio: 16/9;
          object-fit: cover;
          display: block;
          transition: transform 0.4s ease, opacity 0.2s ease;
        }
        .vg-thumb:hover img { transform: scale(1.04); opacity: 0.9; }
        .vg-play {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 48px; height: 34px;
          border-radius: 8px;
          background: var(--brand, #E01B1B);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 14px rgba(0,0,0,0.45);
          transition: transform 0.15s ease;
        }
        .vg-play svg { margin-left: 2px; }
        .vg-thumb:hover .vg-play { transform: translate(-50%, -50%) scale(1.12); }
        .vg-dur {
          position: absolute;
          bottom: 6px; right: 6px;
          background: rgba(0,0,0,0.85);
          color: #fff;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 11px; font-weight: 700;
          padding: 2px 6px;
          border-radius: 3px;
        }
        .vg-meta { padding-top: 8px; }
        .vg-cat {
          display: inline-block;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 10px; font-weight: 800;
          color: var(--brand, #E01B1B);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }
        .vg-title {
          display: block;
          font-family: var(--font-telugu-heading), serif;
          font-size: 15px; font-weight: 700;
          line-height: 1.35;
          color: var(--n-900, #111827);
          text-decoration: none;
        }
        .vg-title:hover { color: var(--brand-dark, #B91414); }
        .vg-views {
          display: block;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 12px;
          color: var(--n-500, #6b7280);
          margin-top: 4px;
        }

        @media (max-width: 1024px) { .vg { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 768px)  { .vg { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px)  { .vg { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
