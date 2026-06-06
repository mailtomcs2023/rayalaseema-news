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
      {/* Image link is decorative: the title link below provides the
          same destination + accessible name. aria-hidden + tabIndex=-1
          keeps the click target for sighted users but hides the
          duplicate from screen readers + tab order, satisfying PSI's
          "Identical links have the same purpose" rule. */}
      <Link href={articleHref(article)} className="af-lead-img" aria-hidden="true" tabIndex={-1}>
        {article.featuredImage ? (
          // Slide 0 is the LCP. We DON'T use `priority` because Next 16
          // emits a <link rel="preload"> WITHOUT fetchPriority="high"
          // for priority images, which PSI flagged ("fetchpriority=high
          // should be applied to the image preload request"). Instead,
          // AboveFold emits the preload tag manually with the right
          // fetchPriority + matching imageSrcSet, and we set
          // loading="eager" + fetchPriority="high" on the <img> so it
          // matches the preload + skips the lazy-load PSI flag.
          <Image
            src={article.featuredImage}
            alt={article.title}
            width={1200}
            height={750}
            sizes="(max-width: 768px) 100vw, 680px"
            quality={60}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
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

  // Keep our custom controls in sync with the Swiper instance + flip
  // `inert` on non-active slides. Swiper's A11y module sets
  // aria-hidden="true" on inactive slides but does NOT remove their
  // <a> from the focus order, which triggers PSI's
  // "aria-hidden contains focusable descendents" rule. inert solves
  // both (focus order + a11y tree) without a DOM rerender.
  const sync = (s: SwiperClass) => {
    setActive(s.activeIndex);
    setAtStart(s.isBeginning);
    setAtEnd(s.isEnd);
    s.slides.forEach((slide, i) => {
      if (i === s.activeIndex) slide.removeAttribute("inert");
      else slide.setAttribute("inert", "");
    });
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
        // autoHeight removed: Swiper reads getBoundingClientRect on
        // every slide for it, which PSI attributed to the home page's
        // 37ms forced reflow. Slides already share a stable layout
        // (image aspect-ratio 16/10 + capped title lines via CSS),
        // so the default flex-stretch behaviour keeps every slide the
        // same height without measuring the DOM.
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
        // aria-disabled (not the native `disabled` attr) so the dimmed arrow
        // still captures hover - shows the not-allowed cursor and blocks the
        // article link beneath. onClick is guarded to a no-op at the boundary.
        aria-disabled={atStart}
        onClick={() => { if (!atStart) swiperRef.current?.slidePrev(); }}
      >
        <ChevronLeft size={22} strokeWidth={2.75} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="af-nav af-nav-next"
        aria-label="తదుపరి స్లైడ్"
        aria-disabled={atEnd}
        onClick={() => { if (!atEnd) swiperRef.current?.slideNext(); }}
      >
        <ChevronRight size={22} strokeWidth={2.75} aria-hidden="true" />
      </button>

      <div className="af-dots" role="tablist" aria-label="స్లైడ్‌లు">
        {items.map((a, i) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            className={`af-dot${i === active ? " af-dot-active" : ""}`}
            aria-label={`స్లైడ్ ${i + 1}`}
            aria-selected={i === active}
            tabIndex={i === active ? 0 : -1}
            onClick={() => swiperRef.current?.slideTo(i)}
          />
        ))}
      </div>
    </div>
  );
}
