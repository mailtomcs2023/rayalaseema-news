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

export function joinTitle(hook: string, english: string): string {
  let h = hook.trim();
  const e = english.trim();
  let out = e ? `${h} | ${e}` : h;
  while (titleLength(out) > TITLE_MAX && [...h].length > 10) {
    h = [...h].slice(0, -1).join("").trim();
    out = e ? `${h} | ${e}` : h;
  }
  return out;
}
