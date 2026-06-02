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
import { categoryHref } from "@/lib/category-href";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Swiper as SwiperClass } from "swiper";
import { Swiper, SwiperSlide } from "swiper/react";
import { Keyboard, A11y } from "swiper/modules";
import "swiper/css";

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
        <Link href={categoryHref(article.category.slug)} className="af-cat">
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
  const swiperRef = useRef<SwiperClass | null>(null);
  const [active, setActive] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  if (items.length === 0) return null;
  // One story → plain hero, no carousel chrome or Swiper JS.
  if (items.length === 1) return <Slide article={items[0]} priority />;

  // Keep our custom controls in sync with the Swiper instance.
  const sync = (s: SwiperClass) => {
    setActive(s.activeIndex);
    setAtStart(s.isBeginning);
    setAtEnd(s.isEnd);
  };

  return (
    <div className="af-carousel">
      {/* Slide counter (current / total) so readers know more stories exist. */}
      <span className="af-carousel-count">
        {active + 1}<span className="af-carousel-count-sep">/</span>{items.length}
      </span>

      <Swiper
        // No Navigation/Pagination modules: those bind arrows only after init
        // (clicks dead until a re-init) and generate dots client-side (flash on
        // load). We drive our own server-rendered controls off the instance.
        modules={[Keyboard, A11y]}
        onSwiper={(s) => { swiperRef.current = s; sync(s); }}
        onSlideChange={sync}
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

      {/* Custom controls: in the SSR HTML (no flash) and wired straight to the
          Swiper instance, so they work on the very first click. */}
      <button
        type="button"
        className="af-nav af-nav-prev"
        aria-label="మునుపటి స్లైడ్"
        disabled={atStart}
        onClick={() => swiperRef.current?.slidePrev()}
      >
        <ChevronLeft size={22} strokeWidth={2.75} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="af-nav af-nav-next"
        aria-label="తదుపరి స్లైడ్"
        disabled={atEnd}
        onClick={() => swiperRef.current?.slideNext()}
      >
        <ChevronRight size={22} strokeWidth={2.75} aria-hidden="true" />
      </button>

      <div className="af-dots" role="tablist" aria-label="స్లైడ్‌లు">
        {items.map((a, i) => (
          <button
            key={a.id}
            type="button"
            className={`af-dot${i === active ? " af-dot-active" : ""}`}
            aria-label={`స్లైడ్ ${i + 1}`}
            aria-selected={i === active}
            onClick={() => swiperRef.current?.slideTo(i)}
          />
        ))}
      </div>
    </div>
  );
}
