// Spec #4 I1 (#241) — pre-launch SEO crawler audit.
//
// Walks the public sitemap.xml, fetches every URL, and reports:
//   - non-200 responses (broken pages)
//   - missing <title> tag
//   - missing canonical link
//   - missing meta description
//   - missing JSON-LD on article + hub pages
//   - duplicate <title> across pages
//   - redirect chains > 1 hop
//
// Exits non-zero on critical issues (404s, missing title) so it can gate
// pre-launch deploy. Warnings (missing description, schema-light) print
// but don't fail.
//
// Usage:
//   BASE_URL=https://rayalaseemanews.com bun packages/db/scripts/seo-launch-audit.ts
//   BASE_URL=http://localhost:3000 bun packages/db/scripts/seo-launch-audit.ts

const BASE_URL = (process.env.BASE_URL || "https://rayalaseemanews.com").replace(/\/$/, "");
const MAX_URLS = Number(process.env.MAX_URLS || 200);

interface Finding {
  url: string;
  level: "critical" | "warning";
  issue: string;
}

const findings: Finding[] = [];
const titles = new Map<string, string[]>(); // title text → list of URLs sharing it

async function fetchSitemapUrls(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/sitemap.xml`);
  if (!res.ok) {
    findings.push({ url: `${BASE_URL}/sitemap.xml`, level: "critical", issue: `sitemap.xml returned ${res.status}` });
    return [];
  }
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).slice(0, MAX_URLS);
}

function getMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1] : null;
}

async function auditUrl(url: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: "manual" });
  } catch (err) {
    findings.push({ url, level: "critical", issue: `fetch failed: ${(err as Error).message}` });
    return;
  }
  // Redirect chain check — manual mode returns 3xx without following.
  if (res.status >= 300 && res.status < 400) {
    const target = res.headers.get("location");
    if (target) {
      const second = await fetch(target.startsWith("http") ? target : `${BASE_URL}${target}`, { redirect: "manual" });
      if (second.status >= 300 && second.status < 400) {
        findings.push({ url, level: "warning", issue: `redirect chain > 1 hop (${res.status} → ${target} → ${second.status})` });
      }
    }
  } else if (res.status >= 400) {
    findings.push({ url, level: "critical", issue: `HTTP ${res.status}` });
    return;
  }
  if (res.status !== 200) return;

  const html = await res.text();
  const title = getMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
  if (!title) {
    findings.push({ url, level: "critical", issue: "missing <title>" });
  } else {
    const arr = titles.get(title.trim()) ?? [];
    arr.push(url);
    titles.set(title.trim(), arr);
  }
  const canonical = getMatch(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (!canonical) {
    findings.push({ url, level: "warning", issue: "missing canonical link" });
  }
  const desc = getMatch(html, /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  if (!desc) {
    findings.push({ url, level: "warning", issue: "missing meta description" });
  }
  if (/\/(article|news|kurnool|nandyal|chittoor|tirupati|ananthapuramu|annamayya|ysr-kadapa|sri-sathya-sai)\//.test(url)) {
    if (!/application\/ld\+json/.test(html)) {
      findings.push({ url, level: "warning", issue: "article/hub page missing JSON-LD" });
    }
  }
}

async function main() {
  console.log(`SEO launch audit against ${BASE_URL}\n`);
  const urls = await fetchSitemapUrls();
  console.log(`Sampled ${urls.length} URLs from sitemap.\n`);

  // Modest concurrency — don't hammer prod.
  const concurrency = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const idx = cursor++;
      const u = urls[idx];
      process.stdout.write(idx % 10 === 0 ? `\n[${idx + 1}/${urls.length}] ` : ".");
      await auditUrl(u);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // Dedup title detection.
  for (const [title, list] of titles.entries()) {
    if (list.length > 1) {
      for (const u of list) findings.push({ url: u, level: "warning", issue: `duplicate <title>: "${title.slice(0, 60)}…"` });
    }
  }

  console.log("\n\nFindings:");
  const critical = findings.filter((f) => f.level === "critical");
  const warning = findings.filter((f) => f.level === "warning");
  console.log(`  ${critical.length} critical, ${warning.length} warnings\n`);
  for (const f of critical) console.log(`  ❌ ${f.url}\n     ${f.issue}`);
  for (const f of warning) console.log(`  ⚠️  ${f.url}\n     ${f.issue}`);

  process.exit(critical.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
