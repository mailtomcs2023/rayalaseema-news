// Server-side wrapper for <Footer />. Fetches the admin-published FOOTER menu
// on the server so the footer's nav columns are in the initial HTML - this
// prevents the empty-then-grow reflow that broke scroll position on refresh
// (refreshing while scrolled to the footer jumped to the top because the
// columns loaded client-side after hydration).
//
// Drop-in replacement for <Footer config={...} /> on SERVER components. Client
// pages keep using <Footer /> directly (it falls back to a client fetch).
import { Footer } from "./footer";
import { getMenuItems } from "@/lib/menu";

export async function SiteFooter({ config = {} }: { config?: Record<string, string> }) {
  const footerItems = await getMenuItems("FOOTER");
  return <Footer config={config} footerItems={footerItems} />;
}
