// NewsMediaOrganization JSON-LD generator. Spec #4 B2 (#198).
//
// Replaces the skeletal NewsMediaOrganization inlined into apps/web layout.tsx
// (logo only, sameAs:[] empty). Full org schema with sameAs links,
// contactPoint, address, foundingDate, and editorial-policy URLs is the
// E-E-A-T anchor Google + AI engines weight heavily for news domains.
//
// Editorial-policy URLs (ethics / corrections / ownership / fact-checking)
// point at /ethics-policy /corrections-policy /ownership /editorial-standards
// — those pages ship in Phase C (#205, #206, #211, #207). Until then the
// URLs 404 cleanly, which is harmless for schema and self-heals once C lands.

import type { JsonLd, PublisherConfig } from "./types";

export interface EditorialPolicies {
  /** /ethics-policy (C2 #205) */
  ethicsPolicy?: string;
  /** /corrections-policy (C3 #206) */
  correctionsPolicy?: string;
  /** /editorial-standards (C4 #207) */
  editorialStandards?: string;
  /** /diversity-policy (C5 #208) */
  diversityPolicy?: string;
  /** /ownership (C8 #211) — also feeds ownershipFundingInfo */
  ownershipFundingInfo?: string;
  /** /editorial-standards or dedicated /verification page if it exists */
  verificationFactCheckingPolicy?: string;
}

export interface ContactPoint {
  email?: string;
  phone?: string;
  contactType?: string; // "editorial" | "customer service" | "corrections" — defaults to "editorial"
}

export interface AddressInput {
  streetAddress?: string;
  locality?: string;      // City
  region?: string;        // State (Andhra Pradesh)
  postalCode?: string;
  country?: string;       // ISO 3166-1 alpha-2; defaults to "IN"
}

interface BuildArgs {
  publisher: PublisherConfig;
  /** All social-profile URLs (facebook/twitter/youtube/instagram/threads/etc). */
  sameAs?: string[];
  contactPoint?: ContactPoint;
  address?: AddressInput;
  /** ISO 8601 date string, e.g. "2026-01-15". */
  foundingDate?: string;
  policies?: EditorialPolicies;
  /**
   * Optional `disambiguatingDescription` for the org. Useful when the brand
   * name collides with another well-known entity — e.g. "Rayalaseema News"
   * is also Indian Railways train 12793/12794, and we use this field to tell
   * Google + AI engines we are a separate entity (the news publication, not
   * the train).
   */
  disambiguatingDescription?: string;
}

function buildContactPoint(cp: ContactPoint): Record<string, unknown> {
  return {
    "@type": "ContactPoint",
    contactType: cp.contactType || "editorial",
    email: cp.email,
    telephone: cp.phone,
    availableLanguage: ["te", "en"],
  };
}

function buildAddress(a: AddressInput): Record<string, unknown> {
  return {
    "@type": "PostalAddress",
    streetAddress: a.streetAddress,
    addressLocality: a.locality,
    addressRegion: a.region,
    postalCode: a.postalCode,
    addressCountry: a.country || "IN",
  };
}

/**
 * Returns the NewsMediaOrganization JSON-LD payload. Injected once on every
 * page via apps/web/src/app/layout.tsx so search engines + AI crawlers see
 * consistent organization-level signals on every URL.
 */
export function buildNewsMediaOrganizationSchema(args: BuildArgs): JsonLd {
  const { publisher, sameAs, contactPoint, address, foundingDate, policies, disambiguatingDescription } = args;
  const same = (sameAs || []).filter(Boolean);
  // Build alternateName: include the Telugu name plus the bare English brand
  // when publicationName has a disambiguator suffix (e.g. "... News").
  const altNames: string[] = [publisher.publicationNameTe];
  if (publisher.publicationName.endsWith(" News")) {
    altNames.push(publisher.publicationName.replace(/ News$/, ""));
  }

  return {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    name: publisher.publicationName,
    alternateName: altNames.length === 1 ? altNames[0] : altNames,
    disambiguatingDescription,
    url: publisher.siteUrl,
    logo: {
      "@type": "ImageObject",
      url: publisher.logoUrl,
    },
    sameAs: same.length > 0 ? same : undefined,
    contactPoint: contactPoint ? buildContactPoint(contactPoint) : undefined,
    address: address ? buildAddress(address) : undefined,
    foundingDate: foundingDate || undefined,
    inLanguage: ["te", "en"],
    publishingPrinciples: policies?.editorialStandards || `${publisher.siteUrl}/about`,
    ethicsPolicy: policies?.ethicsPolicy,
    correctionsPolicy: policies?.correctionsPolicy,
    diversityPolicy: policies?.diversityPolicy,
    ownershipFundingInfo: policies?.ownershipFundingInfo,
    verificationFactCheckingPolicy: policies?.verificationFactCheckingPolicy,
  };
}
