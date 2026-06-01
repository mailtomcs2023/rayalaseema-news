#!/usr/bin/env bun
/**
 * Google Search Console end-to-end setup for rayalaseemanews.com.
 *
 * What it does:
 *   1. Get a DNS-TXT verification token from Site Verification API.
 *   2. Push the TXT record to GoDaddy (using existing scripts/dns auth).
 *   3. Verify ownership.
 *   4. Add the DOMAIN property to Search Console (sc-domain:rayalaseemanews.com).
 *   5. Submit the sitemap index.
 *
 * Re-runnable: every step is idempotent.
 *
 * Run: bun scripts/google/gsc-setup.ts
 */

import { readFileSync } from "node:fs";
import { api } from "./auth";

const DOMAIN = "rayalaseemanews.com";
const SC_DOMAIN_PROP = `sc-domain:${DOMAIN}`;
const SITEMAP_URL = `https://${DOMAIN}/sitemap-index.xml`;

const SCOPES = [
  "https://www.googleapis.com/auth/siteverification",
  "https://www.googleapis.com/auth/webmasters",
];

function loadGoDaddyCreds(): { key: string; secret: string; base: string } {
  const env = readFileSync(".env.local", "utf8");
  const map: Record<string, string> = {};
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  if (!map.GODADDY_API_KEY || !map.GODADDY_API_SECRET) {
    throw new Error("GODADDY_API_KEY / GODADDY_API_SECRET missing in .env.local");
  }
  return {
    key: map.GODADDY_API_KEY,
    secret: map.GODADDY_API_SECRET,
    base: map.GODADDY_API_BASE ?? "https://api.godaddy.com/v1",
  };
}

async function putGoDaddyTXT(name: string, value: string): Promise<void> {
  const gd = loadGoDaddyCreds();
  const url = `${gd.base}/domains/${DOMAIN}/records/TXT/${encodeURIComponent(name)}`;
  const body = [{ data: value, ttl: 600 }];
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `sso-key ${gd.key}:${gd.secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GoDaddy PUT TXT ${name}: ${res.status} ${await res.text()}`);
}

async function getGoDaddyTXT(name: string): Promise<string[]> {
  const gd = loadGoDaddyCreds();
  const url = `${gd.base}/domains/${DOMAIN}/records/TXT/${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    headers: { Authorization: `sso-key ${gd.key}:${gd.secret}`, Accept: "application/json" },
  });
  if (!res.ok) return [];
  const arr = (await res.json()) as Array<{ data: string }>;
  return arr.map((r) => r.data);
}

async function step1_getToken(): Promise<string> {
  console.log("[1/5] requesting DNS-TXT verification token...");
  const res = await api<{ token: string }>(
    "https://www.googleapis.com/siteVerification/v1/token",
    SCOPES,
    {
      method: "POST",
      body: JSON.stringify({
        verificationMethod: "DNS_TXT",
        site: { type: "INET_DOMAIN", identifier: DOMAIN },
      }),
    }
  );
  console.log(`      token: ${res.token}`);
  return res.token;
}

async function step2_putTXT(token: string): Promise<void> {
  console.log("[2/5] checking existing TXT records...");
  const existing = await getGoDaddyTXT("@");
  console.log(`      ${existing.length} TXT records on @`);

  // GoDaddy PUT replaces ALL records of this type on this name.
  // Merge: keep everything that's not a google-site-verification token, add ours.
  const filtered = existing.filter((v) => !v.startsWith("google-site-verification="));
  const final = [...filtered, token];

  console.log("[2/5] pushing TXT record set (keep non-google + add google token)...");
  const gd = loadGoDaddyCreds();
  const url = `${gd.base}/domains/${DOMAIN}/records/TXT/@`;
  const body = final.map((data) => ({ data, ttl: 600 }));
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `sso-key ${gd.key}:${gd.secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GoDaddy PUT TXT: ${res.status} ${await res.text()}`);
  console.log(`      ${final.length} TXT records now on @`);
}

async function step3_waitAndVerify(token: string): Promise<void> {
  console.log("[3/5] waiting for DNS propagation (Google's resolvers)...");
  for (let i = 1; i <= 6; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    process.stdout.write(`      attempt ${i}/6 ... `);
    try {
      const res = await api<{ id: string }>(
        "https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=DNS_TXT",
        SCOPES,
        {
          method: "POST",
          body: JSON.stringify({
            site: { type: "INET_DOMAIN", identifier: DOMAIN },
          }),
        }
      );
      console.log(`verified (id=${res.id})`);
      return;
    } catch (e: any) {
      const msg = String(e.message || e).split("\n")[0];
      console.log(msg.slice(0, 100));
    }
  }
  throw new Error("verification did not succeed after 90s — try again in a few minutes");
}

async function step4_addToSearchConsole(): Promise<void> {
  console.log(`[4/5] adding ${SC_DOMAIN_PROP} to Search Console...`);
  try {
    await api(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SC_DOMAIN_PROP)}`,
      SCOPES,
      { method: "PUT" }
    );
    console.log("      added");
  } catch (e: any) {
    if (String(e.message).includes("409") || String(e.message).includes("already")) {
      console.log("      already present");
    } else {
      throw e;
    }
  }
}

async function step5_submitSitemap(): Promise<void> {
  console.log(`[5/5] submitting sitemap ${SITEMAP_URL}...`);
  await api(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SC_DOMAIN_PROP)}/sitemaps/${encodeURIComponent(SITEMAP_URL)}`,
    SCOPES,
    { method: "PUT" }
  );
  console.log("      submitted");
}

async function main() {
  const token = await step1_getToken();
  await step2_putTXT(token);
  await step3_waitAndVerify(token);
  await step4_addToSearchConsole();
  await step5_submitSitemap();
  console.log("\n✓ Search Console set up for", DOMAIN);
  console.log("  Property: ", SC_DOMAIN_PROP);
  console.log("  Sitemap:  ", SITEMAP_URL);
  console.log("  Open:     https://search.google.com/search-console/welcome?siteUrl=" + encodeURIComponent(SC_DOMAIN_PROP));
}

main().catch((e) => {
  console.error("\nFAILED:", e.message || e);
  process.exit(1);
});
