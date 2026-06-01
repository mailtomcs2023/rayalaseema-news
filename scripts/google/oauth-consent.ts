#!/usr/bin/env bun
/**
 * One-time OAuth consent flow for the desktop client.
 *
 * Opens the user's browser to grant scopes, captures the auth code via a
 * loopback redirect, exchanges it for tokens, and writes the refresh token
 * into .env.local for future runs.
 *
 * After this completes, scripts/google/user-oauth.ts can mint access tokens
 * on demand without further user interaction.
 *
 * Run: bun scripts/google/oauth-consent.ts
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { exec } from "node:child_process";

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/siteverification",
  "https://www.googleapis.com/auth/analytics.edit",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/analytics.manage.users",
  "https://www.googleapis.com/auth/tagmanager.manage.accounts",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.publish",
  "https://www.googleapis.com/auth/tagmanager.manage.users",
  "https://www.googleapis.com/auth/cloud-platform",
];

type OAuthClient = {
  installed: {
    client_id: string;
    client_secret: string;
    token_uri: string;
    auth_uri: string;
    redirect_uris: string[];
  };
};

function loadClient(): OAuthClient["installed"] {
  const raw = readFileSync(".oauth-client.local.json", "utf8");
  const j = JSON.parse(raw) as OAuthClient;
  if (!j.installed) throw new Error("not a Desktop OAuth client JSON");
  return j.installed;
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
}

async function captureCode(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      const u = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      const code = u.searchParams.get("code");
      const err = u.searchParams.get("error");
      const body = err
        ? `<h1>Auth error</h1><pre>${err}</pre>`
        : `<h1>Auth complete — you can close this tab.</h1>`;
      res.writeHead(err ? 400 : 200, { "Content-Type": "text/html" });
      res.end(body);
      srv.close();
      if (err) reject(new Error(err));
      else if (code) resolve(code);
      else reject(new Error("no code in callback"));
    });
    srv.listen(port, "127.0.0.1");
    srv.on("error", reject);
    setTimeout(() => {
      srv.close();
      reject(new Error("timeout waiting for callback"));
    }, 300000);
  });
}

async function main() {
  const client = loadClient();
  const port = 53682;
  const redirect_uri = `http://127.0.0.1:${port}`;

  const authUrl = new URL(client.auth_uri);
  authUrl.searchParams.set("client_id", client.client_id);
  authUrl.searchParams.set("redirect_uri", redirect_uri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  console.log("Opening browser for OAuth consent...");
  console.log("If it doesn't open, paste this URL:");
  console.log(authUrl.toString());
  console.log("");
  openBrowser(authUrl.toString());

  const code = await captureCode(port);
  console.log("Got code — exchanging for tokens...");

  const tokRes = await fetch(client.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokRes.ok) throw new Error(`token exchange: ${tokRes.status} ${await tokRes.text()}`);
  const tok = (await tokRes.json()) as { refresh_token?: string; access_token: string };

  if (!tok.refresh_token) {
    throw new Error("no refresh_token returned — Google only issues one per (client_id, user) pair. " +
      "Revoke prior grant at https://myaccount.google.com/permissions, then retry.");
  }

  // Append/update GOOGLE_OAUTH_REFRESH_TOKEN in .env.local
  const envPath = ".env.local";
  let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (env.match(/^GOOGLE_OAUTH_REFRESH_TOKEN=/m)) {
    env = env.replace(/^GOOGLE_OAUTH_REFRESH_TOKEN=.*$/m, `GOOGLE_OAUTH_REFRESH_TOKEN=${tok.refresh_token}`);
    writeFileSync(envPath, env, "utf8");
  } else {
    appendFileSync(envPath, `\n# Google OAuth (rse-cli desktop client) — added by scripts/google/oauth-consent.ts\nGOOGLE_OAUTH_REFRESH_TOKEN=${tok.refresh_token}\n`, "utf8");
  }
  console.log("✓ Refresh token saved to .env.local");
  console.log(`  Access token (test):  ${tok.access_token.slice(0, 30)}...`);
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
