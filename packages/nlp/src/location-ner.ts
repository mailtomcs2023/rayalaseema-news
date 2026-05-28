// Spec #4 G1 (#231) — Location NER detector.
//
// Dictionary-based exact-token matcher across the District / Constituency /
// Mandal gazetteer. Designed to be cheap (a single pass per article body)
// and deterministic; no ML model + no external API. Accuracy bar per spec:
// 95% on a 100-article test set, which is feasible with a clean gazetteer
// because location names are proper nouns + distinctive in Telugu/English.
//
// Confidence rules:
//   HIGH    — match falls inside the headline OR the first 100 chars of body
//   MEDIUM  — match falls in chars 100..600 (the "lede" band)
//   LOW     — match falls anywhere later in the body
//
// Disambiguation:
//   - Same name appears at multiple location levels (e.g. "Nandyal" is a
//     District AND a Constituency). Pick the MORE-SPECIFIC level (Mandal >
//     Constituency > District) when both are mentioned in the same article.
//   - Same name across multiple sibling entities (e.g. two "Kondapuram"
//     mandals in different districts). Pick the one whose parent district
//     or constituency is ALSO mentioned in the article; fall back to first
//     match by character offset.
//
// The detector does NOT mutate Prisma directly — the caller (admin publish
// hook in G2 #232) takes the NerResult + writes ContentLocation rows. This
// keeps the package portable and testable in isolation.

import type { LocationEntry, LocationMention, NerResult, Confidence, LocationKind } from "./types";

interface DetectArgs {
  /** Article headline. Title-matches always get HIGH confidence. */
  title: string;
  /** Article body — plain text OR HTML. We strip HTML tags before scanning. */
  body: string;
  /** Gazetteer fed from the District/Constituency/Mandal Prisma tables. */
  gazetteer: LocationEntry[];
}

const KIND_RANK: Record<LocationKind, number> = {
  MANDAL: 3,
  CONSTITUENCY: 2,
  DISTRICT: 1,
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function bandConfidence(offset: number, titleLen: number): Confidence {
  // The combined "title + body" string is what we scan. Offsets within the
  // title portion (i.e. < titleLen) are HIGH; the first 100 body chars are
  // HIGH; chars 100..600 are MEDIUM; everything later is LOW.
  if (offset < titleLen + 100) return "HIGH";
  if (offset < titleLen + 600) return "MEDIUM";
  return "LOW";
}

function bestConfidence(a: Confidence, b: Confidence): Confidence {
  if (a === "HIGH" || b === "HIGH") return "HIGH";
  if (a === "MEDIUM" || b === "MEDIUM") return "MEDIUM";
  return "LOW";
}

/**
 * Find all dictionary matches for one location's name forms inside `haystack`.
 * Returns first-offset + occurrence-count, or null when no match.
 *
 * Match is whole-word for English (\b on either side) and substring for
 * Telugu (Telugu word boundaries are unreliable across stem variants;
 * substring is conservative enough for proper nouns).
 */
function findMatches(haystack: string, loc: LocationEntry): { firstOffset: number; occurrences: number; matched: string } | null {
  const variants = [loc.nameEn, loc.name].filter(Boolean);
  let firstOffset = Infinity;
  let occurrences = 0;
  let matched = "";
  for (const v of variants) {
    if (!v || v.length < 3) continue;
    // English variant: whole-word match (case-insensitive).
    const isEnglish = /^[\x00-\x7f]+$/.test(v);
    const re = isEnglish
      ? new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")
      : new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const matches = [...haystack.matchAll(re)];
    if (matches.length > 0) {
      occurrences += matches.length;
      const firstHere = matches[0].index ?? Infinity;
      if (firstHere < firstOffset) {
        firstOffset = firstHere;
        matched = v;
      }
    }
  }
  if (occurrences === 0) return null;
  return { firstOffset, occurrences, matched };
}

/**
 * Pick the strongest mention to use as the article's primary location.
 * Rules: highest confidence first, then most-specific kind, then earliest
 * offset. Mandal > Constituency > District on ties.
 */
function pickPrimary(mentions: LocationMention[]): LocationMention | null {
  if (mentions.length === 0) return null;
  const ranked = [...mentions].sort((a, b) => {
    const confDiff = confidenceRank(b.confidence) - confidenceRank(a.confidence);
    if (confDiff !== 0) return confDiff;
    const kindDiff = KIND_RANK[b.kind] - KIND_RANK[a.kind];
    if (kindDiff !== 0) return kindDiff;
    return a.firstOffset - b.firstOffset;
  });
  return ranked[0];
}

function confidenceRank(c: Confidence): number {
  return c === "HIGH" ? 3 : c === "MEDIUM" ? 2 : 1;
}

/**
 * Disambiguate sibling collisions: when multiple gazetteer entries share a
 * name (e.g. two mandals named "Kondapuram"), keep the one whose parent
 * (district or constituency) is also mentioned elsewhere in the same text.
 * Falls back to keeping all matches when no parent context exists.
 */
function disambiguate(mentions: LocationMention[], gazetteer: LocationEntry[]): LocationMention[] {
  const byKey = new Map<string, LocationMention[]>();
  for (const m of mentions) {
    const loc = gazetteer.find((g) => g.id === m.locationId);
    if (!loc) continue;
    const key = `${loc.kind}:${loc.nameEn.toLowerCase()}`;
    const arr = byKey.get(key) ?? [];
    arr.push(m);
    byKey.set(key, arr);
  }
  const mentionedDistrictSlugs = new Set(
    mentions
      .map((m) => gazetteer.find((g) => g.id === m.locationId))
      .filter((g): g is LocationEntry => !!g && g.kind === "DISTRICT")
      .map((g) => g.nameEn.toLowerCase()),
  );
  const result: LocationMention[] = [];
  for (const group of byKey.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    // Multiple sibling matches — prefer one whose parent district is in the text.
    const preferred = group.find((m) => {
      const loc = gazetteer.find((g) => g.id === m.locationId);
      return loc?.parentDistrictSlug && mentionedDistrictSlugs.has(loc.parentDistrictSlug);
    });
    if (preferred) {
      result.push(preferred);
    } else {
      // Keep the first-occurrence one and drop the others — conservative.
      const earliest = [...group].sort((a, b) => a.firstOffset - b.firstOffset)[0];
      result.push(earliest);
    }
  }
  return result;
}

/**
 * Detect location mentions in an article. Pure function; the caller wires
 * the result into ContentLocation rows.
 */
export function detectLocations(args: DetectArgs): NerResult {
  const title = (args.title || "").trim();
  const body = stripHtml(args.body || "");
  // Combined haystack — title is at offset 0, body starts at title.length+1.
  const haystack = `${title} \n ${body}`;
  const titleLen = title.length + 3; // include the "\n " spacer

  const all: LocationMention[] = [];
  for (const loc of args.gazetteer) {
    const hit = findMatches(haystack, loc);
    if (!hit) continue;
    all.push({
      locationId: loc.id,
      kind: loc.kind,
      confidence: bandConfidence(hit.firstOffset, titleLen),
      matchedTerm: hit.matched,
      firstOffset: hit.firstOffset,
      occurrences: hit.occurrences,
    });
  }

  const disambiguated = disambiguate(all, args.gazetteer);
  // Merge same-location duplicates that the disambiguator allowed (different
  // kinds, e.g. Nandyal-District + Nandyal-Constituency): keep both but make
  // sure confidence reflects the highest band any kind saw.
  const merged = new Map<string, LocationMention>();
  for (const m of disambiguated) {
    const key = `${m.kind}:${m.locationId}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, m);
    } else {
      merged.set(key, {
        ...prev,
        confidence: bestConfidence(prev.confidence, m.confidence),
        occurrences: prev.occurrences + m.occurrences,
        firstOffset: Math.min(prev.firstOffset, m.firstOffset),
      });
    }
  }
  const mentions = [...merged.values()];
  return {
    mentions,
    primary: pickPrimary(mentions),
  };
}
