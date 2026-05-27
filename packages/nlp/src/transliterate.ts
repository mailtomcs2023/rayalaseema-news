// Spec #4 K7 (#252) — Telugu → IAST/Romanised transliteration.
//
// Used at draft-save time to auto-fill the URL slug + English-only meta
// keywords. Editors can override. Capturing both the native and
// romanised forms doubles the reachable query bucket — see research §1.
//
// Implementation: dictionary table mapping each Telugu character to its
// ITRANS-style ASCII equivalent. Order matters: longer multi-char tokens
// (conjuncts, vowel signs after consonants) are matched before single
// characters.

const VOWEL_SIGNS: Record<string, string> = {
  "ా": "aa", "ి": "i", "ీ": "ee", "ు": "u", "ూ": "oo",
  "ృ": "ru", "ౄ": "roo",
  "ె": "e", "ే": "ae", "ై": "ai",
  "ొ": "o", "ో": "oo", "ౌ": "au",
  "ం": "m", "ః": "h", "ఁ": "n",
};

const VOWELS: Record<string, string> = {
  "అ": "a", "ఆ": "aa", "ఇ": "i", "ఈ": "ee", "ఉ": "u", "ఊ": "oo",
  "ఋ": "ru", "ౠ": "roo", "ఌ": "lu", "ౡ": "loo",
  "ఎ": "e", "ఏ": "ae", "ఐ": "ai",
  "ఒ": "o", "ఓ": "oo", "ఔ": "au",
};

const CONSONANTS: Record<string, string> = {
  "క": "ka", "ఖ": "kha", "గ": "ga", "ఘ": "gha", "ఙ": "nga",
  "చ": "cha", "ఛ": "chha", "జ": "ja", "ఝ": "jha", "ఞ": "nya",
  "ట": "ta", "ఠ": "tha", "డ": "da", "ఢ": "dha", "ణ": "na",
  "త": "ta", "థ": "tha", "ద": "da", "ధ": "dha", "న": "na",
  "ప": "pa", "ఫ": "pha", "బ": "ba", "భ": "bha", "మ": "ma",
  "య": "ya", "ర": "ra", "ల": "la", "వ": "va",
  "శ": "sha", "ష": "sha", "స": "sa", "హ": "ha",
  "ళ": "la", "క్ష": "ksha", "ఱ": "rra",
};

const VIRAMA = "్"; // halant — removes inherent 'a'

/**
 * Transliterate a Telugu string into ITRANS-ish ASCII. Output is lowercase,
 * hyphen-safe for use in URL slugs. Non-Telugu characters pass through.
 *
 * Not perfect — this is a pragmatic dictionary mapping, not a full
 * linguistic transliteration. Editors can override the generated slug.
 */
export function teluguToAscii(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1];
    // Conjunct + virama: consonant + halant + consonant → drop inherent 'a'
    if (CONSONANTS[ch] && next === VIRAMA && CONSONANTS[input[i + 2]]) {
      const c1 = CONSONANTS[ch].replace(/a$/, "");
      out += c1;
      i += 2; // skip ch + virama; next iteration handles the second consonant
      continue;
    }
    // Consonant + vowel sign
    if (CONSONANTS[ch] && next && VOWEL_SIGNS[next]) {
      out += CONSONANTS[ch].replace(/a$/, "") + VOWEL_SIGNS[next];
      i += 2;
      continue;
    }
    // Standalone consonant (inherent 'a')
    if (CONSONANTS[ch]) {
      out += CONSONANTS[ch];
      i++;
      continue;
    }
    // Vowel
    if (VOWELS[ch]) {
      out += VOWELS[ch];
      i++;
      continue;
    }
    // Pass-through everything else (spaces, ASCII, punctuation).
    out += ch;
    i++;
  }
  return out;
}

/**
 * Build a URL-safe slug from a Telugu (or mixed) title. Steps:
 *   1) Telugu → ITRANS ASCII
 *   2) lowercase
 *   3) collapse to [a-z0-9-]
 */
export function teluguTitleToSlug(title: string): string {
  return teluguToAscii(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
