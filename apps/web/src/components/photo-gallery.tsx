import Link from "next/link";
import { SectionShell } from "./section-shell";

interface Photo {
  id: string;
  slug: string;
  title: string;
  image: string;
  count: number;
}

/** Photo gallery section - IE-style shell, landscape thumbnails with photo-count badge. */
export function PhotoGallery({ photos }: { photos: Photo[] }) {
  if (!photos || photos.length === 0) return null;

  return (
    <SectionShell title="ఫోటో గ్యాలరీ" moreHref="/gallery">
      <div className="pg-grid">
        {photos.slice(0, 4).map((photo) => (
          <Link key={photo.id} href={`/gallery/${photo.slug}`} className="pg-item">
            <div className="pg-img">
              <img src={photo.image} alt={photo.title} loading="lazy" />
              <div className="pg-shade" />
              <span className="pg-count" aria-label={`${photo.count} photos`}>
                <svg width="11" height="11" fill="#fff" viewBox="0 0 24 24">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                </svg>
                {photo.count}
              </span>
              <h3 className="pg-title">{photo.title}</h3>
            </div>
          </Link>
        ))}
      </div>

      <style>{`
        .pg-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .pg-item { text-decoration: none; display: block; }
        .pg-img {
          position: relative;
          border-radius: 6px;
          overflow: hidden;
          background: #000;
        }
        .pg-img img {
          width: 100%;
          aspect-ratio: 4/3;
          object-fit: cover;
          display: block;
          transition: transform 0.5s ease;
        }
        .pg-item:hover .pg-img img { transform: scale(1.05); }
        .pg-shade {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%);
        }
        .pg-count {
          position: absolute; top: 8px; right: 8px;
          display: inline-flex; align-items: center; gap: 3px;
          background: rgba(0,0,0,0.7);
          color: #fff;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 11px; font-weight: 700;
          padding: 2px 7px;
          border-radius: 3px;
        }
        .pg-title {
          position: absolute; bottom: 0; left: 0; right: 0;
          padding: 10px 10px 11px;
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px; font-weight: 700;
          line-height: 1.35;
          color: #fff;
          text-shadow: 0 1px 3px rgba(0,0,0,0.7);
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        @media (max-width: 768px) { .pg-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 420px) { .pg-grid { grid-template-columns: 1fr; } }
      `}</style>
    </SectionShell>
  );
}
