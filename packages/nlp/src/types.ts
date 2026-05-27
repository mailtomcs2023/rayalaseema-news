// Shared types for @rayalaseema/nlp. Spec #4 G0/G1 (#230/#231).

export type LocationKind = "DISTRICT" | "CONSTITUENCY" | "MANDAL";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

/** One row in the location gazetteer — fed to the NER detector. */
export interface LocationEntry {
  id: string;
  kind: LocationKind;
  /** Telugu name, e.g. "కర్నూలు" */
  name: string;
  /** English name, e.g. "Kurnool" */
  nameEn: string;
  /** Optional parent linkage — used for disambiguation when names collide. */
  parentDistrictSlug?: string;
  parentConstituencySlug?: string;
}

/** One detected mention. */
export interface LocationMention {
  locationId: string;
  kind: LocationKind;
  confidence: Confidence;
  /** Lowercased token that triggered the match (English form preferred). */
  matchedTerm: string;
  /** Character offset of the FIRST occurrence in the input text. */
  firstOffset: number;
  /** Number of occurrences across the input. */
  occurrences: number;
}

/** Final NER output for one article. */
export interface NerResult {
  /** Strongest single mention — feeds the article's primary location URL. */
  primary: LocationMention | null;
  /** All distinct mentions across the chain. */
  mentions: LocationMention[];
}
