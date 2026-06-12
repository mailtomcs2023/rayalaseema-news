// Public e-paper entry URL. When the e-paper is served on its own subdomain
// (epaper.rayalaseemanews.com) set NEXT_PUBLIC_EPAPER_URL to that origin so the
// masthead / nav "E-PAPER" links point at the subdomain. Unset (e.g. local dev
// without the subdomain) falls back to the in-app /epaper route, which keeps
// working unchanged.
export const EPAPER_URL = process.env.NEXT_PUBLIC_EPAPER_URL || "/epaper";
