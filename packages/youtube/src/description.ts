// Description template used for every publish (spec 4.7). The model writes
// the hook and story; this code adds the article link, the place line, the
// hashtags and the footer, so URLs never come from the model.
import type { Place } from "./places";

export function placeLine(p: Place | null, today: boolean): string | null {
  if (!p) return null;
  const t = today ? " Today" : "";
  return p.en === p.district
    ? `${p.en} News${t} | ${p.te} న్యూస్ | Rayalaseema News`
    : `${p.en} News${t} | ${p.te} న్యూస్ | ${p.district} District News | Rayalaseema News`;
}

export type DescriptionParts = {
  hook: string;
  enLine?: string | null;
  articleUrl?: string | null;
  placeLine?: string | null;
  story?: string | null;
  hashtags?: string[];
  site: string;
  subscribeUrl: string;
};

export function buildDescription(a: DescriptionParts): string {
  const blocks: string[] = [];
  blocks.push([a.hook.trim(), a.enLine?.trim() || null, a.articleUrl ? `పూర్తి వార్త: ${a.articleUrl}` : null, a.placeLine || null].filter(Boolean).join("\n"));
  if (a.story?.trim()) blocks.push(a.story.trim());
  if (a.hashtags?.length) blocks.push(a.hashtags.join(" "));
  blocks.push(["రాయలసీమ న్యూస్ | Rayalaseema News", `🌐 ${a.site}`, `సబ్‌స్క్రైబ్ చేయండి: ${a.subscribeUrl}`].join("\n"));
  return blocks.join("\n\n").trim();
}
