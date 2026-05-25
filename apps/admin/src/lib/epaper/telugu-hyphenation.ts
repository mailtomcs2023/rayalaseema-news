// Telugu hyphenation (#102).
//
// Telugu compound words written without spaces (e.g. ఆంధ్రప్రదేశ్రాష్ట్రప్రభుత్వం)
// don't naturally break at the column edge; the renderer ends up with a
// ragged right margin or pushing the whole word to next line — leaving an
// ugly gap. We insert U+00AD (soft hyphen) at syllable-cluster boundaries
// so CSS hyphens: auto + lang="te" can break long words gracefully.
//
// Heuristic rule per AP printing standard: after every 3rd akshara (vowel
// or consonant+vowel-sign cluster) within a single token longer than 10
// characters. Quick + reversible; doesn't need a real corpus.

const TELUGU_RE = /[ఀ-౿]/;
// Vowel signs (matras) that bind to the preceding consonant — never split between consonant + matra.
const MATRA_RE = /[ా-్ౕౖౢౣ]/;
// Virama (halant) — joins consonants into a conjunct; never split across virama.
const VIRAMA = "్";
const SOFT_HYPHEN = "­";

function isAksharaStart(ch: string, prev: string | undefined): boolean {
  if (!TELUGU_RE.test(ch)) return false;
  if (MATRA_RE.test(ch)) return false;
  if (prev === VIRAMA) return false; // consonant after halant continues conjunct
  return true;
}

function hyphenateToken(token: string): string {
  if (token.length < 11) return token;
  if (!TELUGU_RE.test(token)) return token;
  let out = "";
  let aksharaCount = 0;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    const prev = i > 0 ? token[i - 1] : undefined;
    if (isAksharaStart(ch, prev)) {
      aksharaCount++;
      if (aksharaCount > 1 && aksharaCount % 3 === 1) {
        out += SOFT_HYPHEN;
      }
    }
    out += ch;
  }
  return out;
}

export function hyphenateTelugu(text: string | null | undefined): string {
  if (!text) return "";
  // Split on whitespace + punctuation; hyphenate each token, reassemble.
  return text.split(/(\s+|[,.;:!?()\[\]"'…—–]+)/u).map(hyphenateToken).join("");
}
