"use client";

// Spec #4 H1 (#234) - GA4 custom events for editorial signal.
//
// web-vitals reporter (E2 #221) already fires `web_vital` per-page.
// This component adds three more events the editorial team cares about:
//
//   article_read          - fires once per article view, with category +
//                           constituency + author metadata so GA4 funnels
//                           can slice "which districts read which topics".
//   scroll_depth          - 50% + 100% reads. Fires at most twice per page.
//                           Lets editors see if leads are working (bounce
//                           rate ≠ scroll depth; long scroll on a low-CTR
//                           hero means the page IS good, the hero is the
//                           problem).
//   hub_view              - fires on district/constituency/category/tag
//                           hub pages; carries the slug so GA4 reports
//                           "which hubs convert into article clicks".
//
// Rendered conditionally - only when window.gtag exists (GA4 loaded).
// If SiteConfig.google_analytics_id is empty, layout.tsx skips the GA
// loader entirely and this component no-ops cleanly.

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    gtag?: (cmd: string, name: string, params?: Record<string, unknown>) => void;
  }
}

interface ArticleReadProps {
  type: "article_read";
  contentId: string;
  category?: string | null;
  district?: string | null;
  constituency?: string | null;
  author?: string | null;
  bodyWordCount?: number;
}

interface HubViewProps {
  type: "hub_view";
  hubKind: "district" | "constituency" | "mandal" | "category" | "tag" | "author";
  slug: string;
  name?: string;
}

type Props = ArticleReadProps | HubViewProps;

function gtagSafe(name: string, params: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

export function Ga4Events(props: Props) {
  const fired = useRef(false);
  const scrolled50 = useRef(false);
  const scrolled100 = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (props.type === "article_read") {
      gtagSafe("article_read", {
        content_id: props.contentId,
        article_category: props.category ?? "(none)",
        district: props.district ?? "(none)",
        constituency: props.constituency ?? "(none)",
        author: props.author ?? "(none)",
        body_word_count: props.bodyWordCount ?? 0,
      });
    } else {
      gtagSafe("hub_view", {
        hub_kind: props.hubKind,
        hub_slug: props.slug,
        hub_name: props.name ?? props.slug,
      });
    }
  }, [props]);

  useEffect(() => {
    if (props.type !== "article_read") return;
    const onScroll = () => {
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      if (docH <= 0) return;
      const pct = (window.scrollY / docH) * 100;
      if (!scrolled50.current && pct >= 50) {
        scrolled50.current = true;
        gtagSafe("scroll_depth", { percent: 50, content_id: props.contentId });
      }
      if (!scrolled100.current && pct >= 95) {
        scrolled100.current = true;
        gtagSafe("scroll_depth", { percent: 100, content_id: props.contentId });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [props]);

  return null;
}
