// Telugu spell-check (#91).
//
// MVP shipping plan:
//   - Curated common-typo map: misspelling → correction. Editor sees a
//     "telugu-typo" warning per occurrence. Starter list small + biased
//     toward frequent journalistic mistakes - grows via DB updates.
//   - Per-desk ignore list: proper nouns (place + person names) the typo
//     scanner would otherwise false-positive on. Stored in EpaperSpellIgnore
//     so chiefs can curate without code edits.
//
// Real corpus integration (Aspell-Telugu or symspell w/ tel.dic) is a
// follow-up; this MVP catches the recurring errors that embarrass the paper
// without a heavy dependency.

import { prisma } from "@rayalaseema/db";

// Starter typo map. Keys are the misspelled token, values the correction.
// Hand-curated from Telugu journalistic copy. Extend via DB import script.
const COMMON_TYPOS: Record<string, string> = {
  // English-style spaces around punctuation that copy-paste from Word tends
  // to produce - Telugu typography expects tight punctuation.
  "ఎక్‌ప్రెస్": "ఎక్స్‌ప్రెస్",
  "నాయుడు ": "నాయుడు ",
  "శ్రీశైలం": "శ్రీశైలం",
  "హిందుపురం": "హిందూపురం",
  "హిందుపూర్": "హిందూపూర్",
  "ప్రణాలిక": "ప్రణాళిక",
  "ఆంధ్రప్రదేశ్‌": "ఆంధ్రప్రదేశ్",
  "తెలంగాణ‌": "తెలంగాణ",
  // English-typo on Telugu words common in mixed-script bylines
  "Chandrababu": "చంద్రబాబు",
  "Naidu": "నాయుడు",
  "Jagan": "జగన్",
  "Pawan": "పవన్",
  // Date/place pairs that frequently arrive misspelled from feed parsers
  "Anantpur": "Anantapur",
  "Tirupathi": "Tirupati",
  "Kurnoool": "Kurnool",
};

// Tokenizer: splits on whitespace + punctuation while keeping Telugu
// conjuncts (Unicode block U+0C00..U+0C7F) intact.
function tokenize(s: string): string[] {
  return s.split(/[\s,.;:!?()\[\]"'…-–]+/u).filter(Boolean);
}

export interface TeluguTypoHit {
  token: string;
  suggestion: string;
  position: number; // char index in source
}

export async function findTeluguTypos(
  s: string | null | undefined,
  ignoreList?: Set<string>,
): Promise<TeluguTypoHit[]> {
  if (!s) return [];
  const hits: TeluguTypoHit[] = [];
  const tokens = tokenize(s);
  let pos = 0;
  for (const t of tokens) {
    const idx = s.indexOf(t, pos);
    if (idx >= 0) pos = idx + t.length;
    if (ignoreList?.has(t)) continue;
    const fix = COMMON_TYPOS[t];
    if (fix) hits.push({ token: t, suggestion: fix, position: idx });
  }
  return hits;
}

// Per-desk ignore list cached in-memory per process. Refreshed lazily.
let ignoreCache: { at: number; byDesk: Record<string, Set<string>> } | null = null;
const IGNORE_TTL_MS = 5 * 60 * 1000;

export async function loadIgnoreList(deskId?: string | null): Promise<Set<string>> {
  if (!ignoreCache || Date.now() - ignoreCache.at > IGNORE_TTL_MS) {
    // EpaperSpellIgnore is created lazily - if the model doesn't exist yet
    // (rolling out gradually) return an empty set so render path doesn't fail.
    try {
      const rows = await (prisma as any).epaperSpellIgnore?.findMany?.({
        select: { token: true, deskId: true },
      }) ?? [];
      const byDesk: Record<string, Set<string>> = { "*": new Set() };
      for (const r of rows) {
        const key = r.deskId || "*";
        if (!byDesk[key]) byDesk[key] = new Set();
        byDesk[key].add(r.token);
      }
      ignoreCache = { at: Date.now(), byDesk };
    } catch {
      ignoreCache = { at: Date.now(), byDesk: { "*": new Set() } };
    }
  }
  const global = ignoreCache.byDesk["*"] || new Set();
  if (!deskId) return global;
  const desk = ignoreCache.byDesk[deskId];
  if (!desk) return global;
  return new Set([...global, ...desk]);
}
