"use client";

// Tiny client wrapper: holds the open/index state for the Story viewer
// and provides the launcher buttons (the big "Play as Story" button +
// click-to-open on each grid thumb). Keeps the gallery page itself a
// server component so SEO crawlers still see the full image list +
// captions in the static HTML.

import { useState, useCallback } from "react";
import { GalleryStoryViewer } from "./gallery-story-viewer";

interface Photo {
  url: string;
  caption?: string;
}

interface Props {
  photos: Photo[];
  title: string;
}

export function GalleryLauncher({ photos, title }: Props) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(0);

  const openAt = useCallback((i: number) => { setStart(i); setOpen(true); }, []);

  if (!photos.length) return null;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <button
          onClick={() => openAt(0)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "12px 22px",
            background: "var(--brand, #E01B1B)", color: "#fff",
            border: "none", borderRadius: 999,
            fontSize: 14, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(224,27,27,0.32)",
            fontFamily: "var(--font-telugu-body), sans-serif",
          }}>
          <span aria-hidden="true">▶</span>
          స్టోరీగా చూడండి
        </button>
      </div>

      {/* Server-rendered grid sits below (already in the page). We mount
        click handlers on each thumb by re-rendering the grid here for
        the JS-enabled clients. */}
      <div className="gl-grid">
        {photos.map((photo, i) => (
          <button
            key={i}
            type="button"
            onClick={() => openAt(i)}
            className="gl-thumb"
            aria-label={`Open photo ${i + 1} of ${photos.length}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.caption || `Photo ${i + 1}`} loading="lazy" />
            {photo.caption && <span className="gl-cap">{photo.caption}</span>}
          </button>
        ))}
      </div>

      <GalleryStoryViewer
        open={open}
        startIndex={start}
        photos={photos}
        title={title}
        onClose={() => setOpen(false)}
      />

      <style>{`
        .gl-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .gl-thumb {
          position: relative;
          padding: 0;
          border: none;
          background: #0a0a0a;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          aspect-ratio: 1 / 1;
        }
        .gl-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.4s ease;
        }
        .gl-thumb:hover img { transform: scale(1.05); }
        .gl-thumb:focus-visible {
          outline: 3px solid var(--brand, #E01B1B);
          outline-offset: 2px;
        }
        .gl-cap {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          padding: 18px 10px 8px;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 11px;
          color: #fff;
          background: linear-gradient(to top, rgba(0,0,0,0.78), transparent);
          text-align: left;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        @media (max-width: 768px) { .gl-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 420px) { .gl-grid { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
