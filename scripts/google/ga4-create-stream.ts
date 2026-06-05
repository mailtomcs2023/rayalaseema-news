#!/usr/bin/env bun
/**
 * Create a Web data stream on the GA4 property + return measurement ID.
 * Idempotent: skips if a web stream for rayalaseemanews.com already exists.
 */

import { api } from "./auth";

const PROPERTY = "properties/539770425";
const DOMAIN_URL = "https://rayalaseemanews.com";
const STREAM_NAME = "rayalaseemanews.com - web";

const SCOPES = ["https://www.googleapis.com/auth/analytics.edit"];

async function main() {
  // Idempotency check
  const existing = await api<any>(
    `https://analyticsadmin.googleapis.com/v1beta/${PROPERTY}/dataStreams`,
    SCOPES
  );
  const found = (existing.dataStreams || []).find(
    (s: any) => s.type === "WEB_DATA_STREAM" && s.webStreamData?.defaultUri === DOMAIN_URL
  );
  if (found) {
    console.log(`Already exists: ${found.name}  measurementId=${found.webStreamData.measurementId}`);
    return;
  }

  const created = await api<any>(
    `https://analyticsadmin.googleapis.com/v1beta/${PROPERTY}/dataStreams`,
    SCOPES,
    {
      method: "POST",
      body: JSON.stringify({
        type: "WEB_DATA_STREAM",
        displayName: STREAM_NAME,
        webStreamData: { defaultUri: DOMAIN_URL },
      }),
    }
  );
  console.log(`Created: ${created.name}`);
  console.log(`  displayName:   ${created.displayName}`);
  console.log(`  measurementId: ${created.webStreamData.measurementId}`);
  console.log(`  defaultUri:    ${created.webStreamData.defaultUri}`);
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
