// Spec #4 B6 (#202) — schema validation gate.
//
// Asserts every generator in @rayalaseema/seo-schema produces a valid
// JSON-LD payload with the required schema.org shape: @context + @type
// + the fields Google's Rich Results Test would expect at minimum.
//
//   bun test packages/seo-schema
//
// Runs in CI via .github/workflows/schema-validate.yml on every PR.

import { describe, test, expect } from "bun:test";
import {
  buildNewsArticleSchema,
  buildNewsMediaOrganizationSchema,
  buildBreadcrumbListSchema,
  buildPersonSchema,
  stringifyJsonLd,
  type AuthorRef,
  type PublisherConfig,
  type LocationChain,
} from "../src";

const PUBLISHER: PublisherConfig = {
  siteUrl: "https://rayalaseemanews.com",
  publicationName: "Rayalaseema News",
  publicationNameTe: "రాయలసీమ న్యూస్",
  logoUrl: "https://rayalaseemanews.com/logo.png",
};

const AUTHOR: AuthorRef = {
  name: "Suresh Reddy",
  publicProfileSlug: "suresh-reddy",
  role: "EDITOR",
  bio: "Investigative reporter covering Rayalaseema politics.",
  avatar: "https://rayalaseemanews.com/uploads/suresh.jpg",
  twitterHandle: "sureshreddy",
  linkedinUrl: "https://linkedin.com/in/sureshreddy",
  facebookUrl: null,
  expertise: ["politics", "elections"],
  affiliations: ["Press Council of India"],
};

const LOCATION: LocationChain = {
  district: { name: "తిరుపతి", nameEn: "Tirupati", slug: "tirupati", lat: 13.6288, lng: 79.4192 },
  constituency: { name: "చంద్రగిరి", nameEn: "Chandragiri", slug: "chandragiri-166", lat: 13.5842, lng: 79.3167 },
};

describe("NewsArticle generator", () => {
  const ld = buildNewsArticleSchema({
    article: {
      id: "cm12345",
      slug: "test-article",
      title: "Test article",
      summary: "Test summary",
      publishedAt: "2026-05-26T12:00:00Z",
      updatedAt: "2026-05-27T08:00:00Z",
      featuredImage: "https://example.com/img.jpg",
      articleSection: "Politics",
    },
    author: AUTHOR,
    publisher: PUBLISHER,
    locationChain: LOCATION,
    canonicalUrl: "https://rayalaseemanews.com/tirupati/chandragiri-166/test-article-cm12345",
    images: "https://example.com/img.jpg",
  });

  test("required schema.org fields present", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("NewsArticle");
    expect(ld.headline).toBe("Test article");
    expect(ld.inLanguage).toBe("te");
    expect(ld.datePublished).toBeTruthy();
    expect(ld.dateModified).toBeTruthy();
  });

  test("author is Person with url + sameAs", () => {
    expect(ld.author).toMatchObject({
      "@type": "Person",
      name: "Suresh Reddy",
      url: "https://rayalaseemanews.com/author/suresh-reddy",
    });
    expect((ld.author as any).sameAs).toContain("https://twitter.com/sureshreddy");
    expect((ld.author as any).sameAs).toContain("https://linkedin.com/in/sureshreddy");
  });

  test("publisher is NewsMediaOrganization", () => {
    expect(ld.publisher).toMatchObject({ "@type": "NewsMediaOrganization" });
  });

  test("contentLocation + spatialCoverage use most-specific location", () => {
    // Constituency wins over District (no mandal in this chain).
    expect((ld.contentLocation as any).name).toBe("Chandragiri");
    expect((ld.contentLocation as any).geo).toMatchObject({
      "@type": "GeoCoordinates",
      latitude: 13.5842,
      longitude: 79.3167,
    });
    expect((ld.spatialCoverage as any).name).toBe("Chandragiri");
  });

  test("speakable present", () => {
    expect((ld.speakable as any).cssSelector).toEqual(["h1", ".article-body p:first-of-type"]);
  });

  test("stringifyJsonLd escapes </script>", () => {
    const bad = buildNewsArticleSchema({
      article: { id: "x", slug: "y", title: "Test </script><script>alert(1)</script>" },
      author: AUTHOR, publisher: PUBLISHER, canonicalUrl: "https://x/y",
    });
    const json = stringifyJsonLd(bad);
    expect(json).not.toContain("</script>");
    expect(json).toContain("<\\/script");
  });
});

describe("NewsMediaOrganization generator", () => {
  test("includes all editorial-policy URLs when provided", () => {
    const ld = buildNewsMediaOrganizationSchema({
      publisher: PUBLISHER,
      sameAs: ["https://twitter.com/rayalaseema", "https://facebook.com/rayalaseema"],
      contactPoint: { email: "editor@rayalaseemanews.com", phone: "+91-1234567890" },
      address: { locality: "Kurnool", region: "Andhra Pradesh", country: "IN" },
      foundingDate: "2026-01-15",
      policies: {
        ethicsPolicy: "https://rayalaseemanews.com/ethics-policy",
        correctionsPolicy: "https://rayalaseemanews.com/corrections-policy",
        ownershipFundingInfo: "https://rayalaseemanews.com/ownership",
      },
    });
    expect(ld["@type"]).toBe("NewsMediaOrganization");
    expect(ld.sameAs).toHaveLength(2);
    expect((ld.contactPoint as any).email).toBe("editor@rayalaseemanews.com");
    expect((ld.address as any).addressLocality).toBe("Kurnool");
    expect(ld.foundingDate).toBe("2026-01-15");
    expect(ld.ethicsPolicy).toBe("https://rayalaseemanews.com/ethics-policy");
  });

  test("optional fields strip when undefined", () => {
    const ld = buildNewsMediaOrganizationSchema({ publisher: PUBLISHER });
    expect(ld.sameAs).toBeUndefined();
    expect(ld.contactPoint).toBeUndefined();
    expect(ld.address).toBeUndefined();
    expect(ld.foundingDate).toBeUndefined();
  });
});

describe("BreadcrumbList generator", () => {
  test("auto-numbers position + handles current-page (no url) last item", () => {
    const ld = buildBreadcrumbListSchema({
      items: [
        { name: "Home", url: "https://rayalaseemanews.com" },
        { name: "Politics", url: "https://rayalaseemanews.com/category/politics" },
        { name: "Latest article" }, // current page, no url
      ],
    });
    expect(ld["@type"]).toBe("BreadcrumbList");
    const list = ld.itemListElement as any[];
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ "@type": "ListItem", position: 1, name: "Home" });
    expect(list[2].position).toBe(3);
    expect(list[2].item).toBeUndefined(); // current page emits no item URL
  });
});

describe("Person generator", () => {
  test("emits worksFor + sameAs + knowsAbout + alumniOf", () => {
    const ld = buildPersonSchema({ author: AUTHOR, publisher: PUBLISHER });
    expect(ld["@type"]).toBe("Person");
    expect(ld.url).toBe("https://rayalaseemanews.com/author/suresh-reddy");
    expect((ld.worksFor as any).name).toBe("Rayalaseema News");
    expect(ld.knowsAbout).toEqual(["politics", "elections"]);
    expect(ld.alumniOf).toEqual(["Press Council of India"]);
  });
});
