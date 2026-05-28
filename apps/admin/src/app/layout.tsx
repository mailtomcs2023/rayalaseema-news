import type { Metadata } from "next";
import { Providers } from "./providers";
import { auth } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admin | Rayalaseema Express CMS",
  description: "Content Management System for Rayalaseema Express",
  // Spec #4 C10 (#213) - never index the admin app. Locks every page in the
  // CMS out of Google / Bing / AI-crawler caches. Applied at the root layout
  // so child routes inherit; explicit per-page robots can opt back in if we
  // ever surface a public-facing page from the admin domain (none today).
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolve the session server-side and hand it to SessionProvider so client
  // components reading useSession() get the user + role on their FIRST render.
  // Eliminates the "loading flash" where the sidebar (and other auth-aware
  // chrome) renders for ~200-500ms with no role info, then snaps to the
  // role-filtered view once NextAuth's client-side probe resolves.
  const session = await auth();
  // suppressHydrationWarning on <html> + <body> silences the noisy hydration
  // error that fires when browser extensions (Scribe, ColorZilla, Grammarly,
  // password managers, ad blockers, etc.) inject attributes into the DOM
  // BEFORE React hydrates. The mismatch is benign - extensions can't affect
  // our rendered tree - and Next.js docs recommend this exact pattern for
  // the root layout. It only suppresses warnings on those two elements; any
  // real hydration mismatch deeper in the tree still surfaces.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
