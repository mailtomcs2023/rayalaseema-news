/**
 * Mint access tokens from the saved refresh_token (no browser).
 * Pair script to oauth-consent.ts.
 */

import { readFileSync } from "node:fs";

type Client = { installed: { client_id: string; client_secret: string; token_uri: string } };

function loadEnv(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return map;
}

let cachedToken: { tok: string; exp: number } | null = null;

export async function getUserAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.tok;

  const env = loadEnv();
  const rt = env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!rt) throw new Error("GOOGLE_OAUTH_REFRESH_TOKEN missing in .env.local — run oauth-consent.ts first");

  const client = JSON.parse(readFileSync(".oauth-client.local.json", "utf8")) as Client;
  const c = client.installed;

  const res = await fetch(c.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.client_id,
      client_secret: c.client_secret,
      refresh_token: rt,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { tok: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export async function userApi<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getUserAccessToken();
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
