#!/usr/bin/env bun
import { getUserAccessToken } from "./user-oauth";

const t = await getUserAccessToken();
const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
  headers: { Authorization: `Bearer ${t}` },
});
const j = (await r.json()) as { email: string; name?: string };
console.log(`OAuth user: ${j.email}  (${j.name || ""})`);
console.log("");
console.log("GSC properties + sitemaps owned by this user:");
const sites = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
  headers: { Authorization: `Bearer ${t}` },
}).then((x) => x.json() as Promise<any>);
for (const s of sites.siteEntry || []) {
  console.log(`  ${s.siteUrl}  permission=${s.permissionLevel}`);
}
