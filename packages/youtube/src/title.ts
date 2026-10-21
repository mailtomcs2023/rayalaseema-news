// Title shape: "<Telugu hook> | <English headline>", 100 characters max.
// The hook itself may contain " | " (multi-story desk titles), so the
// English half is whatever follows the LAST separator.
export const TITLE_MAX = 100;

export function splitTitle(title: string): { hook: string; english: string } {
  const at = title.lastIndexOf(" | ");
  if (at === -1) return { hook: title.trim(), english: "" };
  return { hook: title.slice(0, at).trim(), english: title.slice(at + 3).trim() };
}

/** Length in code points, which is what YouTube counts for Telugu. */
export function titleLength(t: string): number {
  return [...t].length;
}

/** Join hook and English headline; when over 100 chars, shorten the hook at a word boundary. */
export function joinTitle(hook: string, english: string): string {
  const h = hook.trim();
  const e = english.trim();
  const full = e ? `${h} | ${e}` : h;
  if (titleLength(full) <= TITLE_MAX) return full;
  const room = TITLE_MAX - (e ? titleLength(` | ${e}`) : 0);
  if (room < 10) return full; // nothing sensible to cut; the caller's validation will catch it
  const chars = [...h];
  let cut = chars.slice(0, room).join("");
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace >= 10) cut = cut.slice(0, lastSpace);
  cut = cut.replace(/[\s,.:;|\-–—]+$/g, "").trim();
  return e ? `${cut} | ${e}` : cut;
}
