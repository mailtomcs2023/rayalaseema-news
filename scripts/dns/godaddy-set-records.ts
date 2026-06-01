#!/usr/bin/env bun
/**
 * GoDaddy DNS — point rayalaseemanews.com at the Azure VM.
 *
 * Reads creds from .env.local at repo root:
 *   GODADDY_API_KEY, GODADDY_API_SECRET, GODADDY_API_BASE
 *
 * Run:
 *   bun scripts/dns/godaddy-set-records.ts            # dry-run (default)
 *   bun scripts/dns/godaddy-set-records.ts --apply    # actually PUT records
 *
 * Idempotent — re-running just re-asserts the same record set.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const DOMAIN = "rayalaseemanews.com";
const TARGET_IP = "20.198.2.80";
const TTL = 600;

type Record = { type: string; name: string; data: string; ttl: number };

const RECORDS: Record[] = [
  { type: "A",     name: "@",     data: TARGET_IP, ttl: TTL },
  { type: "A",     name: "admin", data: TARGET_IP, ttl: TTL },
  { type: "CNAME", name: "www",   data: "@",       ttl: TTL },
];

function loadEnv(): Record<string, string> {
  const path = join(process.cwd(), ".env.local");
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const env = { ...loadEnv(), ...process.env } as Record<string, string>;
  const key = env.GODADDY_API_KEY;
  const secret = env.GODADDY_API_SECRET;
  const base = env.GODADDY_API_BASE ?? "https://api.godaddy.com/v1";
  if (!key || !secret) throw new Error("GODADDY_API_KEY / GODADDY_API_SECRET missing in .env.local");

  const auth = `sso-key ${key}:${secret}`;

  // Ownership check
  const owner = await fetch(`${base}/domains/${DOMAIN}`, {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  if (!owner.ok) {
    throw new Error(`Domain ${DOMAIN} not in this account (HTTP ${owner.status})`);
  }
  console.log(`[ok] ${DOMAIN} owned by this account`);

  // For each record type+name pair, replace the full set with our single record
  for (const rec of RECORDS) {
    const url = `${base}/domains/${DOMAIN}/records/${rec.type}/${encodeURIComponent(rec.name)}`;
    const body: any = [{ data: rec.data, ttl: rec.ttl }];
    console.log(`[plan] PUT ${rec.type} ${rec.name} -> ${rec.data} (ttl ${rec.ttl})`);
    if (!apply) continue;

    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PUT ${rec.type} ${rec.name} failed: ${res.status} ${text}`);
    }
    console.log(`[done] ${rec.type} ${rec.name}`);
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to push records.");
  } else {
    console.log("\nAll records pushed. DNS propagation typically 5-30 min.");
    console.log(`Verify: dig +short ${DOMAIN} ; dig +short www.${DOMAIN}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
