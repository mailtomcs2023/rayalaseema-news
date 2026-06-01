#!/usr/bin/env bun
/**
 * Diagnostic + retry for GSC property add.
 * Site Verification succeeded but the PUT to add the property to Search Console
 * did not show up in sites.list. Retry with raw colon (no encoding) + a fresh
 * URL-prefix property as fallback.
 */

import { userApi } from "./user-oauth";

const DOMAIN = "rayalaseemanews.com";
const DOMAIN_PROP = `sc-domain:${DOMAIN}`;
const URL_PREFIX_PROP = `https://${DOMAIN}/`;
const URL_PREFIX_WWW = `https://www.${DOMAIN}/`;
const SITEMAP = `https://${DOMAIN}/sitemap-index.xml`;

async function listAll() {
  const r = await userApi<any>("https://www.googleapis.com/webmasters/v3/sites");
  return r.siteEntry || [];
}

async function siteVerificationList() {
  // What sites are verified for this user?
  const r = await userApi<any>("https://www.googleapis.com/siteVerification/v1/webResource");
  return r.items || [];
}

async function addSite(siteUrl: string) {
  // Path-encode but preserve the colon
  const encoded = siteUrl.replace(/^https:\/\//, "https%3A%2F%2F").replace(/\//g, "%2F").replace(/^sc-domain%3A/, "sc-domain:");
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encoded}`;
  console.log(`  PUT ${url}`);
  await userApi(url, { method: "PUT" });
}

async function main() {
  console.log("=== verified sites (Site Verification API) ===");
  const verified = await siteVerificationList();
  for (const v of verified) {
    console.log(`  ${v.id}  ${v.site?.type}  ${v.site?.identifier}`);
  }
  if (!verified.length) console.log("  (none)");

  console.log("\n=== current GSC sites ===");
  let sites = await listAll();
  for (const s of sites) console.log(`  ${s.siteUrl}  level=${s.permissionLevel}`);
  if (!sites.length) console.log("  (none)");

  // Try adding both DOMAIN and URL-prefix property
  console.log(`\n=== adding ${DOMAIN_PROP} ===`);
  try {
    await addSite(DOMAIN_PROP);
    console.log("  ok");
  } catch (e: any) {
    console.log(`  err: ${String(e.message).split("\n")[0].slice(0, 200)}`);
  }

  console.log(`\n=== adding ${URL_PREFIX_PROP} ===`);
  try {
    await addSite(URL_PREFIX_PROP);
    console.log("  ok");
  } catch (e: any) {
    console.log(`  err: ${String(e.message).split("\n")[0].slice(0, 200)}`);
  }

  console.log(`\n=== adding ${URL_PREFIX_WWW} ===`);
  try {
    await addSite(URL_PREFIX_WWW);
    console.log("  ok");
  } catch (e: any) {
    console.log(`  err: ${String(e.message).split("\n")[0].slice(0, 200)}`);
  }

  console.log("\n=== GSC sites after ===");
  sites = await listAll();
  for (const s of sites) console.log(`  ${s.siteUrl}  level=${s.permissionLevel}`);

  // Submit sitemap on whatever properties exist
  for (const s of sites) {
    if (!s.siteUrl.includes("rayalaseemanews.com")) continue;
    const enc = s.siteUrl.replace(/^https:\/\//, "https%3A%2F%2F").replace(/\//g, "%2F").replace(/^sc-domain%3A/, "sc-domain:");
    const url = `https://www.googleapis.com/webmasters/v3/sites/${enc}/sitemaps/${encodeURIComponent(SITEMAP)}`;
    try {
      await userApi(url, { method: "PUT" });
      console.log(`  sitemap submitted on ${s.siteUrl}`);
    } catch (e: any) {
      console.log(`  sitemap err on ${s.siteUrl}: ${String(e.message).split("\n")[0].slice(0, 150)}`);
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
