import { NextResponse } from "next/server";
import { getArticleBySlug } from "@/lib/db-queries";

// AMP HTML route — /article/[slug]/amp
// Returns a minimal, AMP-valid HTML document. Linked back to canonical from the
// regular article page (and vice versa) so Google can discover the AMP version.
// Spec: https://amp.dev/documentation/guides-and-tutorials/start/create

function sanitizeForAmp(html: string): string {
  // AMP forbids <script>, inline event handlers, <iframe> w/o amp-iframe, <img> (must use amp-img)
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "")
    // Convert <img> → <amp-img> w/ layout=responsive
    .replace(/<img\b([^>]*?)src=("|')(.*?)\2([^>]*?)\/?>/gi, (_m, pre, _q, src, post) => {
      // Try to extract alt
      const altMatch = (pre + post).match(/alt=("|')(.*?)\1/);
      const alt = altMatch ? altMatch[2] : "";
      return `<amp-img src="${src}" alt="${alt}" width="800" height="450" layout="responsive"></amp-img>`;
    })
    .replace(/style="[^"]*"/gi, ""); // strip inline styles (AMP-incompatible)
}

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article || article.status !== "PUBLISHED" || !article.category) {
    return new NextResponse("Not found", { status: 404 });
  }

  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";
  const canonical = `${siteUrl}/article/${slug}`;
  const ampUrl = `${siteUrl}/article/${slug}/amp`;
  const safeBody = sanitizeForAmp(article.body || "");
  const featuredImage = article.featuredImage || "";
  const publishedIso = article.publishedAt?.toISOString() || new Date().toISOString();
  const modifiedIso = article.updatedAt?.toISOString() || publishedIso;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    headline: article.title,
    description: article.summary || article.title,
    image: featuredImage ? [featuredImage] : undefined,
    datePublished: publishedIso,
    dateModified: modifiedIso,
    author: { "@type": "Person", name: article.author.name },
    publisher: {
      "@type": "Organization",
      name: "Rayalaseema Express",
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo.png`, width: 600, height: 60 },
    },
    inLanguage: "te",
  };

  const html = `<!doctype html>
<html ⚡ lang="te">
<head>
  <meta charset="utf-8">
  <title>${article.title}</title>
  <link rel="canonical" href="${canonical}">
  <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
  <meta name="description" content="${(article.summary || article.title).replace(/"/g, "&quot;")}">
  <script async src="https://cdn.ampproject.org/v0.js"></script>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
  <style amp-custom>
    body { font-family: "Noto Sans Telugu", sans-serif; max-width: 720px; margin: 0 auto; padding: 16px; color: #1a1a1a; line-height: 1.7; }
    header { border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 16px; }
    .brand { display: inline-block; padding: 4px 10px; background: #E01B1B; color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border-radius: 4px; }
    h1 { font-size: 26px; font-weight: 800; line-height: 1.3; margin: 12px 0; }
    .meta { font-size: 13px; color: #666; margin-bottom: 16px; }
    .summary { font-size: 16px; color: #444; margin-bottom: 20px; line-height: 1.6; font-style: italic; }
    .body { font-size: 16px; }
    .body h2 { font-size: 20px; font-weight: 700; margin: 20px 0 10px; }
    .body p { margin: 0 0 14px; }
    .body amp-img { margin: 16px 0; }
    footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center; }
    footer a { color: #E01B1B; text-decoration: none; font-weight: 700; }
  </style>
</head>
<body>
  <header>
    <a href="${siteUrl}"><amp-img src="${siteUrl}/logo.png" width="120" height="32" alt="Rayalaseema Express"></amp-img></a>
  </header>
  <article>
    <a href="${siteUrl}/category/${article.category.slug}" class="brand">${article.category.name}</a>
    <h1>${article.title}</h1>
    <p class="meta">${article.author.name} · ${new Date(publishedIso).toLocaleDateString("te-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
    ${featuredImage ? `<amp-img src="${featuredImage}" width="800" height="450" layout="responsive" alt="${article.title.replace(/"/g, "&quot;")}"></amp-img>` : ""}
    ${article.summary ? `<p class="summary">${article.summary}</p>` : ""}
    <div class="body">${safeBody}</div>
  </article>
  <footer>
    Read full version on <a href="${canonical}">rayalaseemaexpress.com</a>
  </footer>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
