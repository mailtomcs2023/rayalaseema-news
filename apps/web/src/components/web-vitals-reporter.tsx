// Spec #4 E2 (#221) — web-vitals → GA4 custom event reporter.
//
// Uses Next 16's built-in useReportWebVitals hook (wraps web-vitals lib) to
// send LCP, INP, CLS, FCP, TTFB to GA4 as `web_vital` custom events. GA4
// already loaded via the layout.tsx GTM/gtag block — we just dispatch
// events to its dataLayer.
//
// Each event carries:
//   event_category: "Web Vitals"
//   event_label:    LCP / INP / CLS / FCP / TTFB
//   value:          metric value (ms for time metrics, *1000 for CLS so
//                   GA4 stores integers — convert back in dashboard)
//   non_interaction: true (don't inflate engagement metric)
//
// Reads on every page navigation. Cheap; web-vitals lib only fires when the
// metric stabilises (e.g. LCP fires after the largest contentful paint
// settles, not on every render).

"use client";

import { useReportWebVitals } from "next/web-vitals";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    const value =
      metric.name === "CLS"
        ? Math.round(metric.value * 1000) // CLS is unitless 0..1; *1000 for GA4 integer column
        : Math.round(metric.value);
    window.gtag("event", "web_vital", {
      event_category: "Web Vitals",
      event_label: metric.name, // LCP | INP | CLS | FCP | TTFB
      value,
      metric_id: metric.id,
      metric_value: metric.value,
      metric_rating: metric.rating, // good | needs-improvement | poor
      non_interaction: true,
    });
  });
  return null;
}
