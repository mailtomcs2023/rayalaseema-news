// Spec 12.3: does the news start inside the opening window, or does the
// video burn its first seconds on a greeting / branding? Shorts get a
// 2 second window, long videos 5 seconds.
import type { Segment } from "./srt";

const INTRO = /స్వాగతం|నమస్కారం|రాయలసీమ న్యూస్|welcome|subscribe|సబ్‌స్క్రైబ్|హలో/i;
const isNews = (text: string) => !INTRO.test(text) && text.split(/\s+/).filter(Boolean).length >= 3;

export type HookCheck = { late: boolean; startsAt: number; reason: string };

export function hookCheck(segments: Segment[], isShort: boolean): HookCheck {
  const window = isShort ? 2 : 5;
  const opening = segments.filter((s) => s.start < window).map((s) => s.text).join(" ").trim();
  if (opening && isNews(opening)) return { late: false, startsAt: 0, reason: "" };
  const first = segments.find((s) => isNews(s.text));
  return {
    late: true,
    startsAt: first ? Math.round(first.start) : window,
    reason: opening ? "opens with greeting or branding" : "no speech in the opening",
  };
}
