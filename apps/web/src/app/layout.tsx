import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { getSiteConfig } from "@/lib/db-queries";
import { buildNewsMediaOrganizationSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";
import { WhatsAppFloat } from "@/components/whatsapp-float";
import { WebVitalsReporter } from "@/components/web-vitals-reporter";
import { PushNotifications } from "@/components/push-notifications";
import { SWRegister } from "@/components/sw-register";
import { MobileAnchorSlot } from "@/components/mobile-anchor-slot";
import "./globals.css";
import { Geist, Noto_Sans_Telugu, Anek_Telugu } from "next/font/google";
import { cn } from "@/lib/utils";

// Spec #4 E5 (#224) - fonts via next/font/google. Self-hosts the woff2
// files at build time so:
//   - No render-blocking external request to fonts.googleapis.com
//   - Automatic subset to Telugu + Latin glyphs only (smaller payload)
//   - display: swap by default - avoids FOIT on Telugu text
// Replaces the <link href="fonts.googleapis.com/..."> tag previously in
// <head>.
const geist = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Body font - Noto Sans Telugu. Exposed under a DEDICATED variable name
// (--font-noto-telugu, not --font-telugu-body) so the next/font self-hosted
// family is the single source of truth; globals.css then maps the semantic
// --font-telugu-body token onto it. (Previously both next/font AND globals.css
// defined --font-telugu-body, and the literal-string version silently shadowed
// the real self-hosted font.)
const notoTelugu = Noto_Sans_Telugu({
  subsets: ["telugu", "latin"],
  variable: "--font-noto-telugu",
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});
// Headline font (#229). Anek Telugu - modern, clean sans-serif with a wide
// weight range, used for headlines via --font-telugu-heading. Replaced
// Noto Serif Telugu (2026-06-02). Anek's weight axis tops out at 800; the
// 900-weight headline sizes (telugu-2xl/3xl) fall back to 800.
const anekTelugu = Anek_Telugu({
  subsets: ["telugu", "latin"],
  variable: "--font-anek-telugu",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#E01B1B",
};

export const metadata: Metadata = {
  // Title leads with the highest-volume English head term ("Telugu News")
  // then brand, then Telugu phrase. Google truncates around 60 chars on
  // SERP but indexes the full title.
  // metadata.title.template lets inner pages set just the page title and
  // Next.js will append " | Rayalaseema News" automatically.
  title: {
    default: "Telugu News Today - Rayalaseema News | రాయలసీమ తాజా వార్తలు",
    template: "%s | Rayalaseema News",
  },
  description:
    "Latest Telugu news from Andhra Pradesh's Rayalaseema region - Kurnool, Nandyal, Anantapur, Sri Sathya Sai, Kadapa, Annamayya, Tirupati, Chittoor. Politics, sports, cinema, weather, mandi prices, gold rates, devotional. తాజా రాయలసీమ వార్తలు, రాజకీయాలు, క్రీడలు, సినిమా.",
  manifest: "/manifest.json",
  keywords: [
    "telugu news",
    "telugu news today",
    "telugu news latest",
    "breaking news telugu",
    "andhra pradesh news",
    "ap news today",
    "తెలుగు వార్తలు",
    "తాజా వార్తలు",
    "ఆంధ్రప్రదేశ్ వార్తలు",
    "Rayalaseema News",
    "rayalaseema news telugu",
    "రాయలసీమ వార్తలు",
    "రాయలసీమ న్యూస్",
    "Kurnool news",
    "Nandyal news",
    "Anantapur news",
    "Sri Sathya Sai news",
    "Kadapa news",
    "Annamayya news",
    "Tirupati news",
    "Chittoor news",
    "కర్నూలు వార్తలు",
    "తిరుపతి వార్తలు",
    "కడప వార్తలు",
    "anantapur gold rate today",
    "kurnool weather today",
    "tirupati darshan tickets",
  ],
  openGraph: {
    title: "Telugu News Today - Rayalaseema News | రాయలసీమ తాజా వార్తలు",
    description: "Latest Telugu news from the Rayalaseema region - Kurnool, Anantapur, Kadapa, Tirupati, Chittoor.",
    type: "website",
    locale: "te_IN",
    siteName: "Rayalaseema News",
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
  // Spec #4 H3 (#236) - Bing Webmaster verification meta tag.
  const bingVerify = config.bing_webmaster_id;
  // Spec #4 H5 (#238) - Microsoft Clarity heatmap + session replay.
  const clarityId = config.clarity_project_id;

  // NewsMediaOrganization JSON-LD (Spec #4 B2 #198). Fields source from
  // SiteConfig - empty values fall through to undefined and get stripped by
  // stringifyJsonLd. Editorial-policy URLs point at C-phase trust pages;
  // they 404 until those land (#205 ethics, #206 corrections, #207 editorial-
  // standards, #208 diversity, #211 ownership).
  const siteUrl = config.site_url || "https://rayalaseemanews.com";
  const sameAs = [
    config.facebook_url, config.twitter_url, config.youtube_url,
    config.instagram_url, config.threads_url, config.linkedin_url,
    config.whatsapp_channel_url,
  ].filter((u): u is string => Boolean(u));
  const orgLd = buildNewsMediaOrganizationSchema({
    publisher: {
      siteUrl,
      // Spec #4 brand disambiguation (2026-05-27) - the legacy brand
      // "Rayalaseema Express" collided with Indian Railways train 12793/12794
      // ("Rayalaseema Express"). We brand the publication as "Rayalaseema News"
      // so search engines + AI engines see a distinct entity from the train.
      publicationName: "Rayalaseema News",
      publicationNameTe: "రాయలసీమ న్యూస్ - వార్తలు",
      logoUrl: `${siteUrl}/logo.png`,
    },
    disambiguatingDescription:
      "Telugu digital news portal for the Rayalaseema region of Andhra Pradesh. Covers the 8 districts of Rayalaseema. Not affiliated with the Visakhapatnam–Tirupati Express train (Indian Railways train numbers 12793/12794).",
    sameAs,
    contactPoint: (config.contact_email || config.contact_phone)
      ? { email: config.contact_email, phone: config.contact_phone, contactType: "editorial" }
      : undefined,
    address: config.contact_address
      ? { streetAddress: config.contact_address, country: "IN", region: "Andhra Pradesh" }
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
    <html lang="te" className={cn("font-sans", geist.variable, notoTelugu.variable, anekTelugu.variable)} suppressHydrationWarning>
      <head>
        {bingVerify && <meta name="msvalidate.01" content={bingVerify} />}
        {/* JSON-LD structured data - search-engine metadata. A PLAIN
            <script type="application/ld+json"> is the App Router pattern for
            structured data: it's crawler-read DATA, not executable JS, so it
            renders straight into <head>. next/script's beforeInteractive is
            meant for real scripts and triggers React's "script tag while
            rendering a component" warning here. (Same pattern as article-view.) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: stringifyJsonLd(orgLd) }}
        />
      </head>
      <body className="font-telugu antialiased" suppressHydrationWarning>
        {/* Google Tag Manager (noscript) - must be immediately after <body> */}
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
        {/* AdSense main script deferred to lazyOnload — kicked off
          when the browser is idle after page load, NOT before LCP.
          AdSense verification needs the script tag to appear in the
          SSR HTML, which next/script lazyOnload still satisfies (the
          tag renders in <body>; the crawler reads it). PSI flagged
          beforeInteractive as the single biggest LCP blocker. */}
        {adsenseId && (
          <Script
            id="adsense"
            async
            strategy="lazyOnload"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseId}`}
            crossOrigin="anonymous"
          />
        )}
        {gtmId && (
          // GTM also deferred to idle — analytics has no business
          // blocking first paint. Anything that GTM needs to fire on
          // page load still gets the gtm.js event (delayed but
          // delivered). If a future tag requires synchronous data
          // layer pushes, bump back to afterInteractive.
          <Script id="gtm" strategy="lazyOnload">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
          </Script>
        )}
        {clarityId && (
          <Script id="clarity" strategy="lazyOnload">
            {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarityId}");`}
          </Script>
        )}
        {/* Direct GA4 gtag.js loader removed (was 157 KB second copy
          of the tag-manager runtime). GTM container above already
          fires GA4 page_view via the GA4 tag configured in the GTM
          dashboard — having both was duplicate work. Falls back to
          the standalone gtag flow if GTM isn't set but GA is. */}
        {gaId && !gtmId && (
          <>
            <Script
              id="ga-loader"
              strategy="lazyOnload"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            />
            <Script id="ga-init" strategy="lazyOnload">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${gaId}');`}
            </Script>
          </>
        )}

        {children}
        <WhatsAppFloat />
        <WebVitalsReporter />
        <PushNotifications />
        <SWRegister />
        {/* Sticky bottom anchor ad - md:hidden inside the component so it
            only shows on phones. Highest-revenue mobile slot per IAB data. */}
        <MobileAnchorSlot config={config as Record<string, string>} />
      </body>
    </html>
  );
}
