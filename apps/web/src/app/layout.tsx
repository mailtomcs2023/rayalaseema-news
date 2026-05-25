import type { Metadata } from "next";
import Script from "next/script";
import { getSiteConfig } from "@/lib/db-queries";
import { CookieConsent } from "@/components/cookie-consent";
import { WhatsAppFloat } from "@/components/whatsapp-float";
import { PushNotifications } from "@/components/push-notifications";
import { DistrictPicker } from "@/components/district-picker";
import { SWRegister } from "@/components/sw-register";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "రాయలసీమ ఎక్స్‌ప్రెస్ | Rayalaseema Express",
  description:
    "రాయలసీమ ప్రాంతం నుండి తాజా వార్తలు, రాజకీయాలు, క్రీడలు, వ్యాపారం మరియు మరిన్ని. Latest news from Rayalaseema region.",
  manifest: "/manifest.json",
  themeColor: "#E01B1B",
  keywords: [
    "Rayalaseema Express",
    "రాయలసీమ ఎక్స్‌ప్రెస్",
    "Telugu news",
    "Kurnool news",
    "Anantapur news",
    "Kadapa news",
    "Rayalaseema news",
  ],
  openGraph: {
    title: "రాయలసీమ ఎక్స్‌ప్రెస్ | Rayalaseema Express",
    description: "రాయలసీమ ప్రాంతం నుండి తాజా వార్తలు",
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
  return (
    <html lang="te" className={cn("font-sans", geist.variable)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;500;600;700;800;900&family=Noto+Serif+Telugu:wght@400;500;600;700;800;900&family=Mandali&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        {/* JSON-LD structured data — search-engine metadata. Uses
            next/script so React 19 doesn't warn about raw <script>
            tags inside components, but renders as an inline script in
            <head> at hydration time (which is what crawlers read). */}
        <Script
          id="ld-json-org"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "NewsMediaOrganization",
            name: "Rayalaseema Express",
            alternateName: "రాయలసీమ ఎక్స్‌ప్రెస్",
            url: "https://rayalaseemaexpress.com",
            logo: "https://rayalaseemaexpress.com/logo.png",
            sameAs: [],
            publishingPrinciples: "https://rayalaseemaexpress.com/about",
          }) }}
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
        <PushNotifications />
        <SWRegister />
      </body>
    </html>
  );
}
