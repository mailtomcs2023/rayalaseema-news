"use client";

// Tiny client island: holds the open/close state for the magazine
// flipbook viewer and renders a single brand-red CTA button.
// Kept separate from the gallery page so the page stays a server
// component (SEO-indexable masonry grid below stays in the static
// HTML for crawlers).

import { useState } from "react";
import { GalleryFlipbook } from "./gallery-flipbook";

interface Photo {
  url: string;
  caption?: string;
}

interface Props {
  photos: Photo[];
  title: string;
}

export function GalleryFlipbookLauncher({ photos, title }: Props) {
  const [open, setOpen] = useState(false);
  if (!photos.length) return null;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            padding: "12px 22px",
            background: "#E01B1B", color: "#fff",
            border: "none", borderRadius: 999,
            fontSize: 14, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(224,27,27,0.32)",
            fontFamily: "var(--font-telugu-body), sans-serif",
          }}>
          <span aria-hidden="true">📖</span>
          ఫ్లిప్‌బుక్‌గా చూడండి
        </button>
      </div>
      <GalleryFlipbook
        open={open}
        photos={photos}
        title={title}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
