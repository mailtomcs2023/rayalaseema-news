"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { articleHref } from "@/lib/article-href";
import { categoryHref } from "@/lib/category-href";

interface SliderItem {
  id: string;
  title: string;
  summary: string;
  slug: string;
  category: { name: string; color: string; slug: string };
  featuredImage: string;
  publishedAt: string;
  author: { name: string };
  desk?: { name: string; nameEn: string } | null;
}

function formatTimeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function NewsSlider({ items }: { items: SliderItem[] }) {
  const [current, setCurrent] = useState(0);
  const [auto, setAuto] = useState(true);

  const next = useCallback(() => setCurrent((p) => (p + 1) % items.length), [items.length]);
  const prev = useCallback(() => setCurrent((p) => (p - 1 + items.length) % items.length), [items.length]);

  useEffect(() => {
    if (!auto || items.length <= 1) return;
    const t = setInterval(next, 5000);
    return () => clearInterval(t);
  }, [auto, next, items.length]);

  if (!items.length) return null;

  const item = items[current];

  return (
    <div
      className="news-slider-wrap"
      onMouseEnter={() => setAuto(false)}
      onMouseLeave={() => setAuto(true)}
    >
      {/* Image area */}
      <div className="news-slider-img">
        {item.featuredImage ? (
          <img
            key={item.id}
            src={item.featuredImage}
            alt={item.title}
            width={1280}
            height={720}
            loading={current === 0 ? "eager" : "lazy"}
            fetchPriority={current === 0 ? "high" : "auto"}
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1a1a2e, #16213e)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src="/logo-inverse.png" alt="రాయలసీమ న్యూస్" style={{ width: 140, height: "auto", objectFit: "contain", opacity: 0.85 }} loading="lazy" />
          </div>
        )}

        {/* Dark overlay */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)" }} />

        {/* Counter */}
        <div className="news-slider-counter">{current + 1}/{items.length}</div>

        {/* Arrows */}
        {items.length > 1 && (
          <>
            <button onClick={prev} className="news-slider-arrow news-slider-arrow-l" aria-label="Previous">
              <svg width="18" height="18" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <button onClick={next} className="news-slider-arrow news-slider-arrow-r" aria-label="Next">
              <svg width="18" height="18" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </button>
          </>
        )}

        {/* Text overlay */}
        <div className="news-slider-text">
          <Link href={categoryHref(item.category.slug)}>
            <span className="news-slider-cat" style={{ background: item.category.color || "var(--color-brand)" }}>
              {item.category.name}
            </span>
          </Link>
          <Link href={articleHref(item)} style={{ textDecoration: "none" }}>
            <h2 className="news-slider-title">
              <span className="news-slider-title-highlight">{item.title.split(" ").slice(0, 3).join(" ")}</span>{" "}
              {item.title.split(" ").slice(3).join(" ")}
            </h2>
          </Link>
          <p className="news-slider-summary">{item.summary}</p>
          <div className="news-slider-meta">
            <span>{item.desk?.name ?? item.author.name}</span>
            <span style={{ opacity: 0.4 }}>|</span>
            <span>{formatTimeAgo(item.publishedAt)}</span>
          </div>
        </div>
      </div>

      {/* Dots */}
      {items.length > 1 && (
        <div className="news-slider-dots">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`news-slider-dot ${i === current ? "active" : ""}`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}

      <style>{`
        .news-slider-wrap {
          border-radius: var(--r-md) var(--r-md) 0 0;
          overflow: hidden;
          background: #000;
        }
        .news-slider-img {
          position: relative;
          width: 100%;
          aspect-ratio: 16/9;
          overflow: hidden;
        }
        .news-slider-counter {
          position: absolute;
          top: var(--sp-2);
          right: var(--sp-2);
          z-index: 20;
          background: var(--brand);
          color: var(--brand-on);
          font-size: var(--t-xs);
          font-weight: var(--w-head);
          letter-spacing: 0.04em;
          padding: 2px var(--sp-2);
          border-radius: var(--r-sm);
        }
        .news-slider-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 20;
          width: 36px;
          height: 36px;
          border-radius: var(--r-pill);
          background: rgba(0,0,0,0.35);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
        }
        .news-slider-wrap:hover .news-slider-arrow { opacity: 1; }
        .news-slider-arrow:hover { background: rgba(0,0,0,0.7); }
        .news-slider-arrow-l { left: var(--sp-2); }
        .news-slider-arrow-r { right: var(--sp-2); }

        .news-slider-text {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 0 var(--sp-5) var(--sp-4);
          z-index: 15;
        }
        .news-slider-cat {
          display: inline-block;
          padding: 2px var(--sp-2);
          border-radius: var(--r-sm);
          color: var(--brand-on);
          font-size: var(--t-xs);
          font-weight: var(--w-head);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: var(--sp-2);
        }
        .news-slider-title {
          font-family: var(--font-telugu-heading);
          font-size: var(--t-2xl);
          font-weight: var(--w-head);
          color: #fff;
          line-height: 1.3;
          text-shadow: 1px 2px 8px rgba(0,0,0,0.8);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 0;
        }
        .news-slider-title-highlight {
          color: #FFD700;
        }
        .news-slider-summary {
          font-size: var(--t-sm);
          color: rgba(255,255,255,0.72);
          font-weight: var(--w-body);
          margin-top: var(--sp-1);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .news-slider-meta {
          display: flex;
          gap: var(--sp-1);
          margin-top: var(--sp-2);
          font-size: var(--t-xs);
          color: rgba(255,255,255,0.55);
        }
        .news-slider-dots {
          display: flex;
          justify-content: center;
          gap: var(--sp-1);
          padding: var(--sp-2) 0;
          background: var(--paper);
        }
        .news-slider-dot {
          width: 8px;
          height: 8px;
          border-radius: var(--r-pill);
          background: var(--n-300);
          border: none;
          cursor: pointer;
          transition: all var(--dur-norm) var(--ease);
          padding: 0;
        }
        .news-slider-dot.active {
          width: 24px;
          background: var(--brand);
        }

        /* Mobile */
        @media (max-width: 768px) {
          .news-slider-img { aspect-ratio: 4/3; }
          .news-slider-text { padding: 0 var(--sp-3) var(--sp-3); }
          .news-slider-title {
            font-size: var(--t-lg);
            line-height: 1.35;
            -webkit-line-clamp: 3;
          }
          .news-slider-summary { display: none; }
          .news-slider-meta { font-size: var(--t-xs); }
          .news-slider-arrow {
            width: 30px;
            height: 30px;
            opacity: 1;
          }
          .news-slider-arrow svg { width: 14px; height: 14px; }
        }

        /* Tablet */
        @media (min-width: 769px) and (max-width: 1024px) {
          .news-slider-title { font-size: var(--t-xl); }
          .news-slider-summary { font-size: var(--t-xs); -webkit-line-clamp: 1; }
        }
      `}</style>
    </div>
  );
}
