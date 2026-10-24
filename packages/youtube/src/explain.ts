// Plain-words reasons behind the deterministic scores (score.ts). The panel
// shows them next to each score and the regenerate prompt feeds them back to
// the model so the next attempt fixes exactly what cost points.
import { splitTitle, titleLength, TITLE_MAX } from "./title";
import type { FitOverride, TitleContext } from "./score";
import type { Suggestions } from "./contract";
import { nameInTitle, searchTermBonus } from "./names";

const hasTelugu = (s: string) => /[ఀ-౿]/.test(s);
const hasEnglish = (s: string) => /[A-Za-z]{3,}/.test(s);

export function explainTitle(title: string, a: TitleContext): string[] {
  const r: string[] = [];
  if (titleLength(title) > TITLE_MAX) r.push("over 100 characters");
  const { english } = splitTitle(title);
  if (!hasEnglish(english)) r.push('no English headline after " | "');
  if (!nameInTitle(title, a.entities)) r.push("no person or place name from the story");
  if (/బ్రేకింగ్|breaking/i.test(title) && !a.breaking) r.push('"breaking" used on a non-breaking item');
  if (/\b\d{1,2}\s?(am|pm)\b|గంటలకు/i.test(title)) r.push("clock time in the title");
  if (searchTermBonus(english, a.volumes) === 0) r.push("no search term in the English half: add a priced keyword or a known place or person");
  return r;
}

export function explainDescription(d: string): string[] {
  const r: string[] = [];
  const lines = d.split("\n").map((l) => l.trim()).filter(Boolean);
  const first = lines[0] ?? "";
  if (!first || /https?:\/\//.test(first)) r.push("first line must be the Telugu hook, not a link");
  if (lines.length < 2 || d.trim().length < 80) r.push("too short: a hook line plus a few story sentences");
  if (d.length > 5000) r.push("over 5,000 characters");
  if (/instagram\.com|facebook\.com|twitter\.com|x\.com\//i.test(d)) r.push("social media links in the description");
  return r;
}

export function explainTags(tags: string[]): string[] {
  const r: string[] = [];
  if (tags.length < 15) r.push("fewer than 15 tags");
  if (tags.length > 25) r.push("more than 25 tags");
  if (!tags.some(hasTelugu)) r.push("no Telugu-script tags");
  if (!tags.some(hasEnglish)) r.push("no English tags");
  if (tags.join(",").length > 450) r.push("tags exceed 450 characters in total");
  return r;
}

/** Why fit scored what it scored, and what changes it: fit grades the video, not the metadata. */
export function explainFit(f: Suggestions["fit"], o?: FitOverride): string[] {
  const r: string[] = [];
  if (f.verdict === "not_fit") r.push("not a Rayalaseema story: the model found no district angle; an admin can record an override to publish anyway");
  if (f.reused_content_risk === "high" && !o?.originalFootage) {
    r.push("reuse risk high: the bulletin carries viral or national clips the channel did not shoot, so fit is capped at 40; keep only original reporting, or an admin can mark the footage as original");
  }
  if (f.local_relevance < 1) r.push(`local relevance ${Math.round(f.local_relevance * 100)}%: only part of the video is about a Rayalaseema district`);
  return r;
}
