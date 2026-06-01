"use client";

import { useState } from "react";
import Link from "next/link";

export interface VideoItem {
  id: string;
  title: string;
  slug: string;
  thumbnail: string;
  videoUrl: string | null;
  duration: string | null;
  views: number;
  category: string | null;
}

// Extract a YouTube video ID from any common URL form.
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

/**
 * Homepage cinematic video band - dark "cinema" block, intentional contrast vs white news.
 * Hero plays inline (YouTube iframe swap on click); rail items also play inline.
 */
export function VideoSection({ videos }: { videos: VideoItem[] }) {
  const [playingId, setPlayingId] = useState<string | null>(null);

  if (!videos.length) return null;

  const hero = videos[0];
  const rail = videos.slice(1, 5);
  const heroYt = ytId(hero.videoUrl);

  return (
    <section className="vs">
      <div className="vs-head">
        <span className="vs-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          RE వీడియోలు
        </span>
        <Link href="/videos" className="vs-all">అన్నీ చూడండి →</Link>
      </div>

      <div className="vs-body">
        {/* HERO */}
        <div className="vs-hero">
          {playingId === hero.id && heroYt ? (
            <div className="vs-frame">
              <iframe
                src={`https://www.youtube.com/embed/${heroYt}?autoplay=1&rel=0`}
                title={hero.title}
                allow="accelerated-fullscreen; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <button
              className="vs-hero-thumb"
              onClick={() => heroYt && setPlayingId(hero.id)}
              aria-label={`Play: ${hero.title}`}
            >
              <img src={hero.thumbnail} alt={hero.title} />
              <span className="vs-play vs-play-lg" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
              </span>
              {hero.duration && <span className="vs-dur">{hero.duration}</span>}
            </button>
          )}
          <div className="vs-hero-meta">
            {hero.category && <span className="vs-cat">{hero.category}</span>}
            <Link href={`/videos/${hero.slug}`} className="vs-hero-title">{hero.title}</Link>
            <span className="vs-views">{fmtViews(hero.views)}</span>
          </div>
        </div>

        {/* RAIL */}
        <div className="vs-rail">
          {rail.map((v) => {
            const vid = ytId(v.videoUrl);
            return (
              <div key={v.id} className="vs-rail-item">
                {playingId === v.id && vid ? (
                  <div className="vs-frame vs-frame-sm">
                    <iframe
                      src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`}
                      title={v.title}
                      allow="accelerated-fullscreen; autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <button
                    className="vs-rail-thumb"
                    onClick={() => vid && setPlayingId(v.id)}
                    aria-label={`Play: ${v.title}`}
                  >
                    <img src={v.thumbnail} alt={v.title} />
                    <span className="vs-play" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                    {v.duration && <span className="vs-dur vs-dur-sm">{v.duration}</span>}
                  </button>
                )}
                <Link href={`/videos/${v.slug}`} className="vs-rail-title">{v.title}</Link>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .vs {
          background: #B91414;
          background-image: linear-gradient(160deg, #E01B1B 0%, #B91414 55%, #8B0F0F 100%);
          border-radius: 8px;
          padding: 18px 20px 22px;
          margin-top: 8px;
        }
        .vs-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.12);
          margin-bottom: 16px;
        }
        .vs-title {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-telugu-heading), serif;
          font-size: 19px;
          font-weight: 800;
          color: #fff;
        }
        .vs-title svg { color: #fff; }
        .vs-all {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 13px;
          font-weight: 800;
          color: #fff;
          text-decoration: none;
        }
        .vs-all:hover { text-decoration: underline; }

        .vs-body { display: flex; gap: 20px; }
        .vs-hero { flex: 1 1 60%; min-width: 0; }
        .vs-rail {
          flex: 1 1 40%;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          align-content: start;
        }

        /* play frame */
        .vs-frame {
          position: relative;
          width: 100%;
          aspect-ratio: 16/9;
          border-radius: 6px;
          overflow: hidden;
          background: #000;
        }
        .vs-frame iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
        }

        /* hero thumb */
        .vs-hero-thumb {
          position: relative;
          display: block;
          width: 100%;
          padding: 0;
          border: 0;
          cursor: pointer;
          border-radius: 6px;
          overflow: hidden;
          background: #000;
        }
        .vs-hero-thumb img {
          width: 100%;
          aspect-ratio: 16/9;
          object-fit: cover;
          display: block;
          transition: transform 0.4s ease, opacity 0.2s ease;
        }
        .vs-hero-thumb:hover img { transform: scale(1.03); opacity: 0.92; }

        .vs-play {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 52px; height: 38px;
          border-radius: 9px;
          background: rgba(255,255,255,0.95);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 16px rgba(0,0,0,0.55);
          transition: transform 0.15s ease;
        }
        .vs-play svg { margin-left: 2px; fill: #B91414; }
        .vs-play-lg { width: 60px; height: 42px; }
        .vs-hero-thumb:hover .vs-play,
        .vs-rail-thumb:hover .vs-play { transform: translate(-50%, -50%) scale(1.12); }

        .vs-dur {
          position: absolute;
          bottom: 8px; right: 8px;
          background: rgba(0,0,0,0.85);
          color: #fff;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 11px; font-weight: 700;
          padding: 2px 6px;
          border-radius: 3px;
        }
        .vs-dur-sm { font-size: 9px; bottom: 5px; right: 5px; }

        .vs-hero-meta { padding-top: 10px; }
        .vs-cat {
          display: inline-block;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 10px; font-weight: 800;
          color: #FFD7D7;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 5px;
        }
        .vs-hero-title {
          display: block;
          font-family: var(--font-telugu-heading), serif;
          font-size: 19px; font-weight: 800;
          line-height: 1.3;
          color: #fff;
          text-decoration: none;
        }
        .vs-hero-title:hover { color: var(--brand-light, #FF6B6B); }
        .vs-views {
          display: block;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 12px;
          color: rgba(255,255,255,0.75);
          margin-top: 5px;
        }

        /* rail items */
        .vs-rail-thumb {
          position: relative;
          display: block;
          width: 100%;
          padding: 0; border: 0;
          cursor: pointer;
          border-radius: 5px;
          overflow: hidden;
          background: #000;
        }
        .vs-rail-thumb img {
          width: 100%;
          aspect-ratio: 16/9;
          object-fit: cover;
          display: block;
          transition: transform 0.4s ease, opacity 0.2s ease;
        }
        .vs-rail-thumb:hover img { transform: scale(1.04); opacity: 0.9; }
        .vs-frame-sm { border-radius: 5px; }
        .vs-rail-title {
          display: block;
          font-family: var(--font-telugu-heading), serif;
          font-size: 13px; font-weight: 700;
          line-height: 1.4;
          color: rgba(255,255,255,0.92);
          text-decoration: none;
          margin-top: 7px;
        }
        .vs-rail-title:hover { color: #FFD7D7; }

        @media (max-width: 900px) {
          .vs-body { flex-direction: column; }
          .vs-hero, .vs-rail { flex-basis: auto; }
        }
        @media (max-width: 480px) {
          .vs-rail { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}
