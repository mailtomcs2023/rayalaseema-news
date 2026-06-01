#!/usr/bin/env bun
/**
 * Get GA4 property + data stream measurement ID via the service account.
 * Run: bun scripts/google/ga4-info.ts
 */

import { api } from "./auth";

const PROPERTY = "properties/539770425";
const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

async function main() {
  const prop = await api<any>(`https://analyticsadmin.googleapis.com/v1beta/${PROPERTY}`, SCOPES);
  console.log(`Property: ${prop.name}  "${prop.displayName}"  tz=${prop.timeZone}  currency=${prop.currencyCode}`);

  const streams = await api<any>(
    `https://analyticsadmin.googleapis.com/v1beta/${PROPERTY}/dataStreams`,
    SCOPES
  );
  for (const s of streams.dataStreams || []) {
    console.log(`  ${s.name}  type=${s.type}  name="${s.displayName}"`);
    if (s.webStreamData) {
      console.log(`    measurementId=${s.webStreamData.measurementId}`);
      console.log(`    defaultUri=${s.webStreamData.defaultUri}`);
      console.log(`    firebaseAppId=${s.webStreamData.firebaseAppId || "(none)"}`);
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
