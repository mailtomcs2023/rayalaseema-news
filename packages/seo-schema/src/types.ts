// Shared types for schema.org JSON-LD payloads. Kept loose intentionally -
// the schema.org vocabulary is huge and full strictness via schema-dts would
// bloat compile time on Next.js apps. Generators in this package return
// `JsonLd` (an object that serializes cleanly via JSON.stringify) and pages
// inject it via <script type="application/ld+json">. Validation gate at PR
// time (B6 #202) keeps shape honest.

/**
 * An object that JSON.stringify produces a valid JSON-LD payload from.
 * Always includes "@context" + "@type". Extra arbitrary keys allowed -
 * schema.org has hundreds of optional properties and we add them per
 * generator without trying to enumerate the whole vocabulary in types.
 */
export type JsonLd = {
  "@context": "https://schema.org" | string;
  "@type": string;
  [k: string]: unknown;
};

/** Shape generators expect when they need a location reference. */
export type LocationRef = {
  name: string;       // Telugu name, e.g. "కర్నూలు"
  nameEn: string;     // English, e.g. "Kurnool"
  slug: string;       // URL slug, e.g. "kurnool"
  lat?: number | null;
  lng?: number | null;
};

/** Article location chain: primary mandal -> constituency -> district. */
export type LocationChain = {
  district: LocationRef;
  constituency?: LocationRef | null;
  mandal?: LocationRef | null;
};

/** Author entity used inside NewsArticle.author + on /author/<slug> page. */
export type AuthorRef = {
  name: string;
  publicProfileSlug: string;   // /author/<slug>
  role?: string | null;
  bio?: string | null;
  avatar?: string | null;
  twitterHandle?: string | null;
  linkedinUrl?: string | null;
  facebookUrl?: string | null;
  expertise?: string[];
  affiliations?: string[];
};

/** Publication-level constants - passed once to every org-level generator. */
export type PublisherConfig = {
  siteUrl: string;             // e.g. "https://rayalaseemaexpress.com"
  publicationName: string;     // e.g. "Rayalaseema Express"
  publicationNameTe: string;   // e.g. "రాయలసీమ ఎక్స్‌ప్రెస్"
  logoUrl: string;
  // Optional but populated for full E-E-A-T signal - fields default to
  // sensible empties if not provided.
  sameAs?: string[];
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  foundingDate?: string;       // ISO 8601 date
  ethicsPolicyUrl?: string;
  correctionsPolicyUrl?: string;
  ownershipUrl?: string;
};
