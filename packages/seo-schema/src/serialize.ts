// JSON-LD serialization helper.
//
// Drops keys whose value is `undefined` so consumer generators can spread
// optional-with-fallback values without leaking `"key": undefined` (which
// JSON.stringify also handles but inconsistently across nesting levels).
//
// Output is HTML-safe in the sense that `</script>` and `<!--` inside string
// values are escaped to prevent JSON-LD injection breaking out of the
// surrounding <script type="application/ld+json"> tag.

import type { JsonLd } from "./types";

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefined).filter((v) => v !== undefined) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      const cleaned = stripUndefined(v);
      if (cleaned === undefined) continue;
      out[k] = cleaned;
    }
    return out as T;
  }
  return value;
}

// U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR) are valid in
// JSON strings but historically broke JS parsers when emitted unescaped
// inside <script> tags (fixed in ES2019; older mobile browsers still bite).
// Built via String.fromCharCode so source files don't carry the literal
// control characters (some editors / linters strip them silently).
const LINE_SEP_RE = new RegExp(String.fromCharCode(0x2028), "g");
const PARA_SEP_RE = new RegExp(String.fromCharCode(0x2029), "g");

function escapeForScriptTag(json: string): string {
  return json
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--")
    .replace(LINE_SEP_RE, "\\u2028")
    .replace(PARA_SEP_RE, "\\u2029");
}

/**
 * Serialize a JSON-LD payload for injection into a `<script type="application/ld+json">`
 * tag. Strips undefined keys, escapes `</script>` so the inline JSON can't
 * break out of the tag, and produces a single compact line (no pretty-print
 * whitespace, since search-engine crawlers don't care and the bytes hurt LCP).
 */
export function stringifyJsonLd(payload: JsonLd): string {
  const clean = stripUndefined(payload);
  return escapeForScriptTag(JSON.stringify(clean));
}
