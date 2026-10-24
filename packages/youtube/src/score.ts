// Deterministic scores (spec 4.4). Pure functions over strings so the
// panel can re-score as the editor types, and the same numbers come out on
// the server.
import { splitTitle, titleLength, TITLE_MAX } from "./title";
import type { Suggestions } from "./contract";

const hasTelugu = (s: string) => /[ఀ-౿]/.test(s);
const hasEnglish = (s: string) => /[A-Za-z]{3,}/.test(s);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export type TitleContext = { entities: Suggestions["entities"]; breaking: boolean; volumes: Map<string, number | null> };

// 85 points for shape and facts, the last 15 for a priced search term in the
// English half, so a penalty is never hidden behind the bonus.
export function scoreTitle(title: string, a: TitleContext): number {
  let s = 85;
  if (titleLength(title) > TITLE_MAX) s -= 20;
  const { english } = splitTitle(title);
  if (!hasEnglish(english)) s -= 25;
  const names = [...a.entities.people, ...a.entities.places].map((x) => x.toLowerCase());
  if (!names.some((n) => title.toLowerCase().includes(n))) s -= 20;
  if (/బ్రేకింగ్|breaking/i.test(title) && !a.breaking) s -= 15;
  if (/\b\d{1,2}\s?(am|pm)\b|గంటలకు/i.test(title)) s -= 10;
  let bonus = 0;
  for (const [term, v] of a.volumes) {
    if (v && english.toLowerCase().includes(term)) bonus = Math.max(bonus, Math.min(15, Math.log10(v) * 5));
  }
  return clamp(s + bonus);
}

// Scores the text the editor writes; the place line and footer are appended
// by code at publish, so they are not part of the rubric.
export function scoreDescription(d: string): number {
  let s = 100;
  const lines = d.split("\n").map((l) => l.trim()).filter(Boolean);
  const first = lines[0] ?? "";
  if (!first || /https?:\/\//.test(first)) s -= 25;
  if (lines.length < 2 || d.trim().length < 80) s -= 25; // a hook alone is not a description
  if (d.length > 5000) s -= 25;
  if (/instagram\.com|facebook\.com|twitter\.com|x\.com\//i.test(d)) s -= 25;
  return clamp(s);
}

export function scoreTags(tags: string[]): number {
  let s = 100;
  if (tags.length < 15 || tags.length > 25) s -= 25;
  if (!tags.some(hasTelugu) || !tags.some(hasEnglish)) s -= 25;
  if (tags.join(",").length > 450) s -= 25;
  return clamp(s);
}

export function scoreThumbnail(a: { headline: string; hasFrame: boolean; bytes?: number; width?: number; height?: number }): number {
  let s = 100;
  if (a.headline.trim().split(/\s+/).length > 5) s -= 33;
  if (!a.hasFrame) s -= 33;
  if (a.bytes && a.bytes > 2_000_000) s -= 33;
  if (a.width && a.height && (a.width !== 1280 || a.height !== 720)) s -= 33;
  return clamp(s);
}

export function scoreFit(f: Suggestions["fit"]): number {
  const base = f.local_relevance * 100;
  return clamp(f.reused_content_risk === "high" ? Math.min(40, base) : base);
}

export type Scores = { title: number; thumbnail: number; description: number; tags: number; fit: number; overall: number };

export function overall(s: Omit<Scores, "overall">): number {
  return clamp((s.title * 35 + s.thumbnail * 25 + s.description * 15 + s.tags * 10 + s.fit * 15) / 100);
}
