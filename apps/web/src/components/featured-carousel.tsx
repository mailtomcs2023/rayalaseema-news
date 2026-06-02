"use client";

// Manual-navigation hero carousel of editor-"featured" stories, built on
// Swiper. Arrows + dots + swipe + keyboard, NO autoplay (manual only, by
// product decision). Each slide reuses the global `.af-lead` styles from
// above-fold.tsx so a slide is visually identical to the old single hero.
//
// SSR-safe: Swiper server-renders the slide markup, so the lead story and its
// image ship in the HTML (SEO + LCP). Only the first slide's image is eager
// (`priority`); the rest lazy-load. Falls back to a plain hero (no Swiper
// chrome/JS) when there is only one featured story.

import { useRef, useState } from "react";
import { articleHref } from "@/lib/article-href";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Keyboard, A11y } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

export interface FeaturedArticle {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  featuredImage?: string | null;
  publishedAt?: string | null;
  category: { name: string; color?: string; slug: string };
}

function Slide({ article, priority }: { article: FeaturedArticle; priority?: boolean }) {
  return (
    <div className="af-lead">
      <Link href={articleHref(article)} className="af-lead-img" aria-label={article.title}>
        {article.featuredImage ? (
          <Image
            src={article.featuredImage}
            alt={article.title}
            width={1200}
            height={750}
            sizes="(max-width: 768px) 100vw, 680px"
            priority={priority}
          />
        ) : (
          <div className="af-noimg">RE</div>
        )}
      </Link>
      <div className="af-lead-text">
        <Link href={`/category/${article.category.slug}`} className="af-cat">
          {article.category.name}
        </Link>
        <Link href={articleHref(article)} className="af-lead-link">
          <h2 className="af-lead-title">{article.title}</h2>
        </Link>
        {article.summary && <p className="af-lead-dek">{article.summary}</p>}
      </div>
    </div>
  );
}

export function FeaturedCarousel({ items }: { items: FeaturedArticle[] }) {
  // Hooks first (Rules of Hooks) - called every render regardless of count.
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [active, setActive] = useState(0);

  if (items.length === 0) return null;
  // One story → plain hero, no carousel chrome or Swiper JS.
  if (items.length === 1) return <Slide article={items[0]} priority />;

  return (
    <div className="af-carousel">
      {/* Slide counter (current / total) so readers know more stories exist. */}
      <span className="af-carousel-count">
        {active + 1}<span className="af-carousel-count-sep">/</span>{items.length}
      </span>

      <Swiper
        modules={[Navigation, Pagination, Keyboard, A11y]}
        // Custom lucide arrow buttons (rendered below). Wiring the refs in
        // onBeforeInit avoids the first-render-null gotcha and keeps the arrows
        // as real server-rendered SVGs - no glyph-font flash on load.
        navigation={{ prevEl: prevRef.current, nextEl: nextRef.current }}
        onBeforeInit={(swiper) => {
          const nav = swiper.params.navigation;
          if (nav && typeof nav !== "boolean") {
            nav.prevEl = prevRef.current;
            nav.nextEl = nextRef.current;
          }
        }}
        onSlideChange={(swiper) => setActive(swiper.activeIndex)}
        pagination={{ clickable: true }}
        keyboard={{ enabled: true }}
        slidesPerView={1}
        spaceBetween={0}
        autoHeight
      >
        {items.map((a, i) => (
          <SwiperSlide key={a.id}>
            <Slide article={a} priority={i === 0} />
          </SwiperSlide>
        ))}
      </Swiper>

      <button ref={prevRef} type="button" className="af-nav af-nav-prev" aria-label="మునుపటి స్లైడ్">
        <ChevronLeft size={22} strokeWidth={2.75} aria-hidden="true" />
      </button>
      <button ref={nextRef} type="button" className="af-nav af-nav-next" aria-label="తదుపరి స్లైడ్">
        <ChevronRight size={22} strokeWidth={2.75} aria-hidden="true" />
      </button>
    </div>
  );
}
