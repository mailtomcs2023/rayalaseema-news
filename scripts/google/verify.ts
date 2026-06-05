#!/usr/bin/env bun
/**
 * Verify the service account JSON works + report what APIs respond.
 *
 * Run: bun scripts/google/verify.ts
 */

import { loadSA, api } from "./auth";

const CLOUD_PLATFORM = "https://www.googleapis.com/auth/cloud-platform";

async function check(name: string, fn: () => Promise<unknown>): Promise<void> {
  process.stdout.write(`${name.padEnd(40)} `);
  try {
    const r = await fn();
    console.log(`OK   ${typeof r === "object" ? JSON.stringify(r).slice(0, 80) : r}`);
  } catch (e: any) {
    console.log(`FAIL ${String(e.message || e).split("\n")[0].slice(0, 200)}`);
  }
}

async function main() {
  const sa = loadSA();
  console.log(`Service account: ${sa.client_email}`);
  console.log(`Project:         ${sa.project_id}`);
  console.log("");

  // Project reachable (Cloud Resource Manager)
  await check("cloudresourcemanager projects.get", () =>
    api(`https://cloudresourcemanager.googleapis.com/v1/projects/${sa.project_id}`, [CLOUD_PLATFORM])
  );

  // Enabled APIs list
  await check("serviceusage enabled APIs (count)", async () => {
    const r: any = await api(
      `https://serviceusage.googleapis.com/v1/projects/${sa.project_id}/services?filter=state:ENABLED&pageSize=200`,
      [CLOUD_PLATFORM]
    );
    return `${(r.services || []).length} APIs enabled`;
  });

  // Search Console API - sites list (will be empty until SA added as owner of a property)
  await check("searchconsole sites.list", () =>
    api("https://www.googleapis.com/webmasters/v3/sites", [
      "https://www.googleapis.com/auth/webmasters.readonly",
    ]).then((r: any) => `${(r.siteEntry || []).length} sites`)
  );

  // GA4 admin - accounts list (empty until SA added to a GA4 account)
  await check("analyticsadmin accounts.list", () =>
    api("https://analyticsadmin.googleapis.com/v1beta/accounts", [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/analytics.edit",
    ]).then((r: any) => `${(r.accounts || []).length} accounts`)
  );

  // Tag Manager - accounts list
  await check("tagmanager accounts.list", () =>
    api("https://www.googleapis.com/tagmanager/v2/accounts", [
      "https://www.googleapis.com/auth/tagmanager.manage.accounts",
      "https://www.googleapis.com/auth/tagmanager.edit.containers",
    ]).then((r: any) => `${(r.account || []).length} accounts`)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
