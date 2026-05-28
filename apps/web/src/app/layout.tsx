import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { getSiteConfig } from "@/lib/db-queries";
import { buildNewsMediaOrganizationSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";
import { CookieConsent } from "@/components/cookie-consent";
import { WhatsAppFloat } from "@/components/whatsapp-float";
import { WebVitalsReporter } from "@/components/web-vitals-reporter";
import { PushNotifications } from "@/components/push-notifications";
import { DistrictPicker } from "@/components/district-picker";
import { SWRegister } from "@/components/sw-register";
import "./globals.css";
import { Geist, Noto_Sans_Telugu, Noto_Serif_Telugu, Mandali } from "next/font/google";
import { cn } from "@/lib/utils";

// Spec #4 E5 (#224) — fonts via next/font/google. Self-hosts the woff2
// files at build time so:
//   - No render-blocking external request to fonts.googleapis.com
//   - Automatic subset to Telugu + Latin glyphs only (smaller payload)
//   - display: swap by default — avoids FOIT on Telugu text
// Replaces the <link href="fonts.googleapis.com/..."> tag previously in
// <head>.
const geist = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const notoTelugu = Noto_Sans_Telugu({
  subsets: ["telugu", "latin"],
  variable: "--font-telugu-body",
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});
const notoSerifTelugu = Noto_Serif_Telugu({
  subsets: ["telugu", "latin"],
  variable: "--font-telugu-heading",
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});
const mandali = Mandali({
  subsets: ["telugu", "latin"],
  variable: "--font-mandali",
  weight: ["400"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#E01B1B",
};

export const metadata: Metadata = {
  // Spec #4 brand disambiguation — title carries " News" suffix so Google
  // doesn't collapse our brand into the Indian Railways train of the same
  // name. See ~/.claude/.../memory/project_brand_disambiguation.md.
  title: "Rayalaseema Express News | రాయలసీమ ఎక్స్‌ప్రెస్ వార్తలు",
  description:
    "Telugu news portal covering the Rayalaseema region of Andhra Pradesh. Hyper-local news from Kurnool, Nandyal, Anantapuramu, Sri Sathya Sai, YSR-Kadapa, Annamayya, Tirupati, and Chittoor.",
  manifest: "/manifest.json",
  keywords: [
    "Rayalaseema Express News",
    "Rayalaseema news",
    "రాయలసీమ ఎక్స్‌ప్రెస్ వార్తలు",
    "Telugu news portal",
    "Telugu news Andhra Pradesh",
    "Kurnool news",
    "Anantapur news",
    "Kadapa news",
    "Tirupati news",
    "Chittoor news",
    "Nandyal news",
  ],
  openGraph: {
    title: "Rayalaseema Express News | రాయలసీమ ఎక్స్‌ప్రెస్ వార్తలు",
    description: "Telugu news portal for the Rayalaseema region of Andhra Pradesh.",
    type: "website",
    locale: "te_IN",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = await getSiteConfig();
  const gaId = config.google_analytics_id;
  const adsenseId = config.google_adsense_id;
  const gtmId = config.google_tag_manager_id;
  // Spec #4 H3 (#236) — Bing Webmaster verification meta tag.
  const bingVerify = config.bing_webmaster_id;
  // Spec #4 H5 (#238) — Microsoft Clarity heatmap + session replay.
  const clarityId = config.clarity_project_id;

  // NewsMediaOrganization JSON-LD (Spec #4 B2 #198). Fields source from
  // SiteConfig — empty values fall through to undefined and get stripped by
  // stringifyJsonLd. Editorial-policy URLs point at C-phase trust pages;
  // they 404 until those land (#205 ethics, #206 corrections, #207 editorial-
  // standards, #208 diversity, #211 ownership).
  const siteUrl = config.site_url || "https://rayalaseemaexpress.com";
  const sameAs = [
    config.facebook_url, config.twitter_url, config.youtube_url,
    config.instagram_url, config.threads_url, config.linkedin_url,
    config.whatsapp_channel_url,
  ].filter((u): u is string => Boolean(u));
  const orgLd = buildNewsMediaOrganizationSchema({
    publisher: {
      siteUrl,
      // Spec #4 brand disambiguation (2026-05-27) — "Rayalaseema Express" is
      // also Indian Railways train 12793/12794. We brand the publication as
      // "Rayalaseema Express News" so search engines + AI engines see a
      // distinct entity from the train. alternateName preserves the legacy
      // brand for users typing the shorter form.
      publicationName: "Rayalaseema Express News",
      publicationNameTe: "రాయలసీమ ఎక్స్‌ప్రెస్ - వార్తలు",
      logoUrl: `${siteUrl}/logo.png`,
    },
    disambiguatingDescription:
      "Telugu digital news portal for the Rayalaseema region of Andhra Pradesh. Covers the 8 districts of Rayalaseema. Not affiliated with the Visakhapatnam–Tirupati Express train (Indian Railways train numbers 12793/12794).",
    sameAs,
    contactPoint: (config.contact_email || config.contact_phone)
      ? { email: config.contact_email, phone: config.contact_phone, contactType: "editorial" }
      : undefined,
    address: config.contact_address
      ? { streetAddress: config.contact_address, addressCountry: "IN", region: "Andhra Pradesh" }
      : undefined,
    foundingDate: config.founding_date || undefined,
    policies: {
      ethicsPolicy: `${siteUrl}/ethics-policy`,
      correctionsPolicy: `${siteUrl}/corrections-policy`,
      editorialStandards: `${siteUrl}/editorial-standards`,
      diversityPolicy: `${siteUrl}/diversity-policy`,
      ownershipFundingInfo: `${siteUrl}/ownership`,
      verificationFactCheckingPolicy: `${siteUrl}/editorial-standards`,
    },
  });
  return (
    <html lang="te" className={cn("font-sans", geist.variable, notoTelugu.variable, notoSerifTelugu.variable, mandali.variable)} suppressHydrationWarning>
      <head>
        {bingVerify && <meta name="msvalidate.01" content={bingVerify} />}
        {/* JSON-LD structured data — search-engine metadata. Uses
            next/script so React 19 doesn't warn about raw <script>
            tags inside components, but renders as an inline script in
            <head> at hydration time (which is what crawlers read). */}
        <Script
          id="ld-json-org"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: stringifyJsonLd(orgLd) }}
        />
      </head>
      <body className="font-telugu antialiased" suppressHydrationWarning>
        {/* Google Tag Manager (noscript) — must be immediately after <body> */}
        {gtmId && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}

        {/* Analytics + ads loaded via next/script so they survive client
            navigations and respect Next's loading strategies (and don't
            trip React 19's "raw <script> in component" warning). */}
        {adsenseId && (
          <Script
            id="adsense"
            async
            strategy="afterInteractive"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`}
            crossOrigin="anonymous"
          />
        )}
        {gtmId && (
          <Script id="gtm" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
          </Script>
        )}
        {clarityId && (
          <Script id="clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarityId}");`}
          </Script>
        )}
        {gaId && (
          <>
            <Script
              id="ga-loader"
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${gaId}');`}
            </Script>
          </>
        )}

        {children}
        <DistrictPicker />
        <WhatsAppFloat />
        <CookieConsent />
        <WebVitalsReporter />
        <PushNotifications />
        <SWRegister />
      </body>
    </html>
  );
}
