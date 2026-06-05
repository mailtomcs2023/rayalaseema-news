/**
 * Shared Google auth helper - JWT-bearer flow for service account JSON.
 *
 * Usage:
 *   import { getAccessToken } from "./auth.ts";
 *   const token = await getAccessToken(["https://www.googleapis.com/auth/cloud-platform"]);
 */

import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { resolve } from "node:path";

type SAKey = {
  type: "service_account";
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  token_uri: string;
};

let cachedKey: SAKey | null = null;

export function loadSA(path = process.env.GOOGLE_APPLICATION_CREDENTIALS || ".gcp-sa.local.json"): SAKey {
  if (cachedKey) return cachedKey;
  const abs = resolve(process.cwd(), path);
  const raw = readFileSync(abs, "utf8");
  cachedKey = JSON.parse(raw) as SAKey;
  if (cachedKey.type !== "service_account") throw new Error("not a service account key");
  return cachedKey;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export async function getAccessToken(scopes: string[]): Promise<string> {
  const sa = loadSA();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: sa.private_key_id }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: scopes.join(" "),
    aud: sa.token_uri,
    exp: now + 3600,
    iat: now,
  }));
  const toSign = `${header}.${claims}`;
  const sig = b64url(createSign("RSA-SHA256").update(toSign).sign(sa.private_key));
  const jwt = `${toSign}.${sig}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function api<T = any>(
  url: string,
  scopes: string[],
  init: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken(scopes);
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": init.body ? "application/json" : "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || "GET"} ${url} -> ${res.status}\n${text}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}
