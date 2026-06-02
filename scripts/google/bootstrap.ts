#!/usr/bin/env bun
/**
 * One-shot bootstrap of GA4 + GTM permissions for the service account.
 *
 * What it does (via the user's OAuth, since GA/GTM UIs reject SA emails):
 *   1. Add rse-automation@... to the existing GA4 account as admin.
 *   2. Create a GTM account "Rayalaseema News" if missing.
 *   3. Create a Web container "rayalaseemanews.com" inside it.
 *   4. Add rse-automation@... to the GTM account with publish rights.
 *
 * Idempotent. Re-runnable without side effects after success.
 *
 * Run: bun scripts/google/bootstrap.ts
 */

import { userApi } from "./user-oauth";
import { loadSA } from "./auth";

const GA4_ACCOUNT_ID = "396396839"; // from inventory output
const GTM_ACCOUNT_NAME = "Rayalaseema News";
const GTM_CONTAINER_NAME = "rayalaseemanews.com";

async function step1_ga4AddSA(saEmail: string): Promise<void> {
  console.log("[1] GA4: adding service account to account", GA4_ACCOUNT_ID, "...");

  // Check if already there
  const list = await userApi<any>(
    `https://analyticsadmin.googleapis.com/v1alpha/accounts/${GA4_ACCOUNT_ID}/accessBindings`
  );
  const exists = (list.accessBindings || []).find((b: any) => b.user === saEmail);
  if (exists) {
    console.log(`    already bound (${exists.name})`);
    return;
  }

  const res = await userApi<any>(
    `https://analyticsadmin.googleapis.com/v1alpha/accounts/${GA4_ACCOUNT_ID}/accessBindings`,
    {
      method: "POST",
      body: JSON.stringify({
        user: saEmail,
        roles: ["predefinedRoles/admin"],
      }),
    }
  );
  console.log(`    bound: ${res.name}`);
}

async function step2_gtmAccount(): Promise<{ accountPath: string; isNew: boolean }> {
  console.log("[2] GTM: ensuring account exists...");
  const accs = await userApi<any>("https://www.googleapis.com/tagmanager/v2/accounts");
  const found = (accs.account || []).find((a: any) => a.name === GTM_ACCOUNT_NAME);
  if (found) {
    console.log(`    existing: ${found.path}`);
    return { accountPath: found.path, isNew: false };
  }
  const created = await userApi<any>("https://www.googleapis.com/tagmanager/v2/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: GTM_ACCOUNT_NAME,
      shareData: false,
    }),
  });
  console.log(`    created: ${created.path}`);
  return { accountPath: created.path, isNew: true };
}

async function step3_gtmContainer(accountPath: string): Promise<string> {
  console.log("[3] GTM: ensuring container exists...");
  const conts = await userApi<any>(`https://www.googleapis.com/tagmanager/v2/${accountPath}/containers`);
  const found = (conts.container || []).find((c: any) => c.name === GTM_CONTAINER_NAME);
  if (found) {
    console.log(`    existing: ${found.path}  publicId=${found.publicId}`);
    return found.publicId;
  }
  const created = await userApi<any>(`https://www.googleapis.com/tagmanager/v2/${accountPath}/containers`, {
    method: "POST",
    body: JSON.stringify({
      name: GTM_CONTAINER_NAME,
      usageContext: ["web"],
      domainName: ["rayalaseemanews.com", "www.rayalaseemanews.com", "admin.rayalaseemanews.com"],
    }),
  });
  console.log(`    created: ${created.path}  publicId=${created.publicId}`);
  return created.publicId;
}

async function step4_gtmAddSA(accountPath: string, saEmail: string): Promise<void> {
  console.log("[4] GTM: adding service account to account", accountPath, "...");
  const perms = await userApi<any>(`https://www.googleapis.com/tagmanager/v2/${accountPath}/user_permissions`);
  const exists = (perms.userPermission || []).find((p: any) => p.emailAddress === saEmail);
  if (exists) {
    console.log(`    already granted (${exists.path})`);
    return;
  }
  // Need the container ID to grant container access
  const conts = await userApi<any>(`https://www.googleapis.com/tagmanager/v2/${accountPath}/containers`);
  const containerIds = (conts.container || []).map((c: any) => c.containerId);

  const granted = await userApi<any>(`https://www.googleapis.com/tagmanager/v2/${accountPath}/user_permissions`, {
    method: "POST",
    body: JSON.stringify({
      emailAddress: saEmail,
      accountAccess: { permission: "admin" },
      containerAccess: containerIds.map((containerId: string) => ({
        containerId,
        permission: "publish",
      })),
    }),
  });
  console.log(`    granted: ${granted.path}`);
}

async function main() {
  const sa = loadSA();
  console.log(`Service account: ${sa.client_email}\n`);

  await step1_ga4AddSA(sa.client_email);
  const { accountPath } = await step2_gtmAccount();
  const containerPublicId = await step3_gtmContainer(accountPath);
  await step4_gtmAddSA(accountPath, sa.client_email);

  console.log("\n✓ Bootstrap complete");
  console.log(`  GA4 property ID:     properties/539770425  (already existed)`);
  console.log(`  GTM container ID:    ${containerPublicId}`);
  console.log(`  SA now has admin on GA4 + GTM`);
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
