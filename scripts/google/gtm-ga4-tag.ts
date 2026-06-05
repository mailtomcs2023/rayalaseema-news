#!/usr/bin/env bun
/**
 * GTM: create a GA4 Configuration tag inside the rayalaseemanews.com container
 * so GA4 fires via GTM (cleaner long-term - analytics changes don't need
 * code deploys, just GTM workspace publishes).
 *
 * Idempotent: skips if a tag named "GA4 Configuration" already exists.
 *
 * Run: bun scripts/google/gtm-ga4-tag.ts
 */

import { api as saApi } from "./auth";

const SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.publish",
  "https://www.googleapis.com/auth/tagmanager.delete.containers",
  "https://www.googleapis.com/auth/cloud-platform",
];
const userApi = <T = any>(url: string, init: RequestInit = {}) => saApi<T>(url, SCOPES, init);

const GTM_ACCOUNT = "accounts/6358498453";
const GTM_CONTAINER_ID = "254187951";
const GA4_MEASUREMENT_ID = "G-WLSW4FWZNT";
const TAG_NAME = "GA4 Configuration";

async function main() {
  // Locate the default workspace
  const workspaces = await userApi<any>(
    `https://www.googleapis.com/tagmanager/v2/${GTM_ACCOUNT}/containers/${GTM_CONTAINER_ID}/workspaces`
  );
  const ws = workspaces.workspace?.[0];
  if (!ws) throw new Error("no workspace found");
  console.log(`Workspace: ${ws.name}  (${ws.path})`);

  // Check existing tags
  const tags = await userApi<any>(`https://www.googleapis.com/tagmanager/v2/${ws.path}/tags`);
  const existing = (tags.tag || []).find((t: any) => t.name === TAG_NAME);
  if (existing) {
    console.log(`Tag "${TAG_NAME}" already exists (${existing.path}) - skipping create.`);
  } else {
    // GA4 Configuration tag needs a trigger - All Pages.
    // Look up the built-in All Pages trigger.
    const triggers = await userApi<any>(`https://www.googleapis.com/tagmanager/v2/${ws.path}/triggers`);
    let allPages = (triggers.trigger || []).find((t: any) => t.type === "pageview" && t.name?.match(/all pages/i));
    if (!allPages) {
      // built-in "All Pages" trigger has a fixed ID - create one
      console.log("Creating 'All Pages' trigger...");
      allPages = await userApi<any>(`https://www.googleapis.com/tagmanager/v2/${ws.path}/triggers`, {
        method: "POST",
        body: JSON.stringify({
          name: "All Pages",
          type: "pageview",
        }),
      });
    }
    console.log(`Trigger: ${allPages.name}  (${allPages.triggerId})`);

    console.log(`Creating tag "${TAG_NAME}"...`);
    const created = await userApi<any>(`https://www.googleapis.com/tagmanager/v2/${ws.path}/tags`, {
      method: "POST",
      body: JSON.stringify({
        name: TAG_NAME,
        type: "gaawc", // GA4 Configuration tag (Google Analytics: GA4 Configuration)
        parameter: [
          { key: "measurementId", type: "template", value: GA4_MEASUREMENT_ID },
          { key: "sendPageView", type: "boolean", value: "true" },
        ],
        firingTriggerId: [allPages.triggerId],
      }),
    });
    console.log(`  Tag created: ${created.path}`);
  }

  // Publishing via API requires either user OAuth with RAPT (fresh consent)
  // or domain-wide delegation for the SA. Both are friction; the tag itself
  // is committed in the workspace, just needs a manual Publish click.
  console.log("\n✓ Tag committed to workspace draft.");
  console.log("");
  console.log("Manual step (one click):");
  console.log(`  1. Open: https://tagmanager.google.com/#/container/accounts/6358498453/containers/${GTM_CONTAINER_ID}/workspaces`);
  console.log("  2. Top right → 'Submit' button");
  console.log("  3. Version Name: 'Initial GA4 wire-up'  →  Description: 'GA4 G-WLSW4FWZNT firing on All Pages'");
  console.log("  4. Click 'Publish'");
  console.log("");
  console.log("After publish: GA4 fires via GTM. Legacy direct gtag/js in layout.tsx stays as safety net.");
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
