// Spec #4 H1 (#234) - GA4 custom-event dispatcher.
//
// Thin client-side helper that pushes events to the gtag dataLayer set up
// in layout.tsx. All custom events used by Spec #4 funnel through here
// so renaming / extending a payload is a one-file change.
//
// Events tracked:
//   article_read       - fired when scroll-depth passes 75% on /article routes
//   hub_view           - fired on /district, /constituency, /category, /tag, /author
//   search_query       - fired on /search form submit
//   scroll_depth_50    - scroll milestone
//   scroll_depth_100   - scroll milestone
//   web_vital          - already fired by web-vitals-reporter.tsx (E2 #221)
//   live_blog_view     - K5 LiveBlogPosting article render
//   gold_rate_view     - K1 /gold-rate page render
//   mandi_view         - K2 /mandi-prices page render

"use client";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export type GA4EventName =
  | "article_read"
  | "hub_view"
  | "search_query"
  | "scroll_depth_50"
  | "scroll_depth_100"
  | "web_vital"
  | "live_blog_view"
  | "gold_rate_view"
  | "mandi_view";

export function track(name: GA4EventName, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
