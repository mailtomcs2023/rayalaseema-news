// Centralized slug helpers — every article slug in the system MUST go through these.
// Prevents URL-breaking characters (slashes, spaces, unicode, punctuation) from reaching the DB.

const MAX_SLUG_LEN = 120;

// Telugu → Latin transliteration map. Used as the FALLBACK when AI translation
// of a headline to an English slug isn't available (server-side path, AI down,
// or non-news content). Keys cover independent vowels, consonants, dependent
// vowel signs, anusvara/visarga, and Telugu digits. Conjunct clusters render
// as their constituent letters (good enough for slugs — not for serious i18n
// transliteration). Missing characters are dropped, which is the right call
// for URL slugs (punctuation / emoji / etc. shouldn't survive).
const TELUGU_MAP: Record<string, string> = {
  // Independent vowels
  "అ": "a", "ఆ": "aa", "ఇ": "i", "ఈ": "ii",
  "ఉ": "u", "ఊ": "uu", "ఋ": "r", "ౠ": "rr",
  "ఎ": "e", "ఏ": "ee", "ఐ": "ai",
  "ఒ": "o", "ఓ": "oo", "ఔ": "au",
  // Consonants
  "క": "k", "ఖ": "kh", "గ": "g", "ఘ": "gh", "ఙ": "ng",
  "చ": "ch", "ఛ": "ch", "జ": "j", "ఝ": "jh", "ఞ": "ny",
  "ట": "t", "ఠ": "th", "డ": "d", "ఢ": "dh", "ణ": "n",
  "త": "t", "థ": "th", "ద": "d", "ధ": "dh", "న": "n",
  "ప": "p", "ఫ": "ph", "బ": "b", "భ": "bh", "మ": "m",
  "య": "y", "ర": "r", "ల": "l", "వ": "v",
  "శ": "sh", "ష": "sh", "స": "s", "హ": "h",
  "ళ": "l", "ఱ": "r",
  // Dependent vowel signs (matras)
  "ా": "aa", "ి": "i", "ీ": "ii", "ు": "u", "ూ": "uu",
  "ృ": "r", "ౄ": "rr",
  "ె": "e", "ే": "ee", "ై": "ai",
  "ొ": "o", "ో": "oo", "ౌ": "au",
  // Anusvara (ం=m), visarga (ః=h), virama (్) — virama suppresses inherent vowel
  "ం": "m", "ః": "h", "్": "",
  // Telugu digits
  "౦": "0", "౧": "1", "౨": "2", "౩": "3", "౪": "4",
  "౫": "5", "౬": "6", "౭": "7", "౮": "8", "౯": "9",
};

/** Telugu → Latin character mapping. Drops unmapped non-ASCII chars. */
export function transliterateTelugu(s: string): string {
  let out = "";
  for (const ch of s) {
    if (TELUGU_MAP[ch] !== undefined) {
      out += TELUGU_MAP[ch];
    } else if (/[a-zA-Z0-9\s-]/.test(ch)) {
      out += ch;
    }
    // anything else (punctuation, emoji, other scripts) is dropped
  }
  return out;
}

/** Slug placeholders the editor stamps on a brand-new draft. Useful for the
 *  "regenerate from title" check on save — if the slug is still one of these
 *  we know the user hasn't customized it yet. */
const PLACEHOLDER_SLUG_RE = /^(untitled|breaking|news)-\d+$/;
export function isPlaceholderSlug(slug: string | null | undefined): boolean {
  if (!slug) return true;
  return PLACEHOLDER_SLUG_RE.test(slug);
}

/** Strip everything except [a-z0-9-]. Collapse repeated dashes. Trim leading/trailing dashes. */
export function sanitizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, MAX_SLUG_LEN);
}

/**
 * Build a fresh slug from a title.
 * Strategy:
 *  1. Try the ASCII (English) portion — yields readable slugs for English / translated headlines.
 *  2. If no usable ASCII (pure Telugu title), transliterate to Latin characters.
 *  3. If even transliteration produces nothing, fall back to a timestamp-based slug.
 *  4. Always sanitize the final result.
 */
export function buildSlugFromTitle(title: string, fallbackPrefix = "news"): string {
  const ascii = title.replace(/[^\x00-\x7F]/g, " ").trim();
  if (ascii.length >= 3) {
    const clean = sanitizeSlug(ascii);
    if (clean) return clean;
  }
  // Telugu (or any non-ASCII) title — transliterate.
  const transliterated = transliterateTelugu(title).trim();
  if (transliterated.length >= 3) {
    const clean = sanitizeSlug(transliterated);
    if (clean) return clean;
  }
  return `${fallbackPrefix}-${Date.now()}`;
}

/**
 * Ensure uniqueness against a pre-fetched set of existing slugs. Appends -1, -2, ... until unique.
 * Caller is responsible for adding the returned slug to the set if they keep using it.
 */
export function uniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 1;
  let candidate: string;
  do {
    candidate = sanitizeSlug(`${base}-${i++}`);
  } while (existing.has(candidate));
  return candidate;
}
