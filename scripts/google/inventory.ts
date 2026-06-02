#!/usr/bin/env bun
/**
 * Inventory what GA4 / GTM / AdSense the user already has via their OAuth.
 * Used to plan whether to create new properties or just add SA to existing.
 *
 * Run: bun scripts/google/inventory.ts
 */

import { userApi } from "./user-oauth";

async function safe<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e: any) {
    console.log(`  [${name}] err: ${String(e.message || e).split("\n")[0].slice(0, 150)}`);
    return null;
  }
}

async function main() {
  console.log("=== GA4 accounts ===");
  const ga4 = await safe("GA4", () =>
    userApi<any>("https://analyticsadmin.googleapis.com/v1beta/accounts")
  );
  if (ga4?.accounts) {
    for (const a of ga4.accounts) {
      console.log(`  ${a.name}  "${a.displayName}"  (regionCode=${a.regionCode})`);
    }
  } else {
    console.log("  (no GA4 accounts)");
  }

  console.log("\n=== GA4 properties (per account) ===");
  for (const acc of ga4?.accounts || []) {
    const accId = acc.name; // e.g. accounts/123
    const props = await safe(`GA4 props ${accId}`, () =>
      userApi<any>(`https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:${accId}`)
    );
    for (const p of props?.properties || []) {
      console.log(`  ${p.name}  "${p.displayName}"  account=${accId}  timezone=${p.timeZone}`);
    }
    if (!props?.properties?.length) console.log(`  ${accId}: no properties`);
  }

  console.log("\n=== GTM accounts ===");
  const gtm = await safe("GTM", () =>
    userApi<any>("https://www.googleapis.com/tagmanager/v2/accounts")
  );
  if (gtm?.account) {
    for (const a of gtm.account) {
      console.log(`  ${a.path}  "${a.name}"`);
    }
  } else {
    console.log("  (no GTM accounts)");
  }

  console.log("\n=== GTM containers (per account) ===");
  for (const a of gtm?.account || []) {
    const conts = await safe(`GTM containers ${a.path}`, () =>
      userApi<any>(`https://www.googleapis.com/tagmanager/v2/${a.path}/containers`)
    );
    for (const c of conts?.container || []) {
      console.log(`  ${c.path}  "${c.name}"  publicId=${c.publicId}  usage=${c.usageContext}`);
    }
    if (!conts?.container?.length) console.log(`  ${a.path}: no containers`);
  }

  console.log("\n=== Search Console sites (current user) ===");
  const gsc = await safe("GSC", () =>
    userApi<any>("https://www.googleapis.com/webmasters/v3/sites")
  );
  for (const s of gsc?.siteEntry || []) {
    console.log(`  ${s.siteUrl}  level=${s.permissionLevel}`);
  }
  if (!gsc?.siteEntry?.length) console.log("  (no sites)");
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
