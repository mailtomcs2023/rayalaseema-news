import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata = { title: "Terms of Service | Rayalaseema News" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24, color: "#111" }}>Terms of Service</h1>
        <div className="article-body" style={{ fontSize: 15, lineHeight: 1.8, color: "#333" }}>
          <p><strong>Last Updated:</strong> April 2026</p>

          <h2>1. Acceptance of Terms</h2>
          <p>By accessing and using Rayalaseema News (rayalaseemanews.com), you accept and agree to be bound by these Terms of Service.</p>

          <h2>2. Content Usage</h2>
          <ul>
            <li>All content on this website is copyrighted by Rayalaseema News</li>
            <li>You may share articles via social media using the provided share buttons</li>
            <li>Reproducing, copying, or distributing content without written permission is prohibited</li>
            <li>News agencies and media outlets must obtain prior permission for syndication</li>
          </ul>

          <h2>3. User Conduct</h2>
          <p>When using our website, you agree not to:</p>
          <ul>
            <li>Post defamatory, obscene, or inflammatory comments</li>
            <li>Impersonate any person or entity</li>
            <li>Upload malicious code or attempt to hack the website</li>
            <li>Use automated tools to scrape content</li>
          </ul>

          <h2>4. Comments & User Content</h2>
          <ul>
            <li>You retain ownership of comments you post</li>
            <li>By posting, you grant us a non-exclusive license to display your content</li>
            <li>We reserve the right to remove any comment without notice</li>
            <li>Comments do not represent the views of Rayalaseema News</li>
          </ul>

          <h2>5. Advertisements</h2>
          <p>We display third-party advertisements. We are not responsible for the content of these advertisements or any transactions you enter into with advertisers.</p>

          <h2>6. Disclaimer</h2>
          <ul>
            <li>News is provided "as is" without warranties of any kind</li>
            <li>We strive for accuracy but errors may occur</li>
            <li>We are not liable for any damages arising from use of this website</li>
            <li>External links are provided for convenience; we do not endorse linked websites</li>
          </ul>

          <h2>7. Governing Law</h2>
          <p>These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Kurnool, Andhra Pradesh.</p>

          <h2>8. Contact</h2>
          <p>For queries regarding these terms: <a href="mailto:legal@rayalaseemanews.com">legal@rayalaseemanews.com</a></p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
