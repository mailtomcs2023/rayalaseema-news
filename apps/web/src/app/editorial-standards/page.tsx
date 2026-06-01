// Spec #4 C4 (#207) — /editorial-standards.
//
// Linked from NewsMediaOrganization.verificationFactCheckingPolicy + publishingPrinciples.

import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export const metadata: Metadata = {
  title: "Editorial Standards | రాయలసీమ న్యూస్",
  description:
    "Editorial standards at Rayalaseema News — fact-checking, attribution, embargoes, off-the-record handling, and bilingual translation rules.",
  alternates: { canonical: `${SITE_URL}/editorial-standards` },
};

export default function EditorialStandardsPage() {
  const ld = buildBreadcrumbListSchema({
    items: [{ name: "Home", url: SITE_URL }, { name: "Editorial Standards" }],
  });
  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(ld) }} />
      <Header />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 6, color: "#111" }}>Editorial Standards</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>Last reviewed: 2026-05-27</p>

        <div className="article-body" style={{ fontSize: 16, lineHeight: 1.85, color: "#333" }}>
          <p>
            These standards describe the practices our reporters and editors follow when sourcing, writing, and
            publishing news. They are intended to make our judgement calls visible and our work easier to challenge.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Fact-checking</h2>
          <p>
            Before publication, every article is checked against the source documents the reporter cited. Names,
            titles, dates, numbers, locations, and direct quotes are verified independently. When a fact cannot be
            independently confirmed, we attribute it to the source ("according to the district collector's office")
            rather than asserting it as established truth.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Attribution</h2>
          <p>
            Every claim that is not common knowledge carries an attribution — a person, document, agency, or
            publication. We avoid the passive constructions ("it has been reported", "sources say") that hide the
            origin of information. When using wire service or syndicated content, the source is named in the byline
            or article footer.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>On-the-record, off-the-record</h2>
          <p>
            By default, conversations with sources are on the record. Off-the-record arrangements must be agreed
            <em> before</em> the source shares information, never after. "On background" means the information may
            be used but not attributed; "deep background" means the reporter may understand the information but not
            publish it. We do not retroactively grant anonymity to embarrass our reporters.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Embargoes</h2>
          <p>
            We respect embargoes negotiated in good faith with sources — typically press releases that ask us not
            to publish until a stated time. We do not honour embargoes used to manipulate the news cycle (e.g.
            embargoes set for late Friday night to bury bad news). Embargo decisions sit with the editor on duty.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Bilingual translation</h2>
          <p>
            Rayalaseema News publishes primarily in Telugu, with English summaries on news that has regional or
            national significance. Our AI-assisted translation pipeline (extract → compose → fact-check) preserves
            named entities, numbers, and direct quotes exactly; cultural references and idioms are rendered into
            natural Telugu rather than literally translated. A human editor reviews every translated article before
            publication.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Headlines and social media</h2>
          <p>
            Headlines must reflect the substance of the article. We do not use clickbait constructions ("you won't
            believe what happened next") or questions that the article doesn't answer. Social media posts linking to
            our articles must accurately summarise the article they link to.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Image and video standards</h2>
          <p>
            Photographs are not digitally altered beyond standard tonal corrections (exposure, white balance,
            cropping). We never composite multiple images and present the result as documentary. Stock photography
            used to illustrate a story is captioned "Representative image". Video is not selectively edited in ways
            that change the meaning of what is shown or said.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Reader interaction</h2>
          <p>
            Comments on our articles are moderated for harassment, hate speech, doxxing, and spam — not for
            disagreement with our reporting. We engage with serious factual challenges in our
            {" "}<Link href="/corrections-policy" style={{ color: "var(--color-brand)" }}>corrections policy</Link>{" "}
            and treat all other feedback per our
            {" "}<Link href="/feedback-policy" style={{ color: "var(--color-brand)" }}>feedback policy</Link>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
