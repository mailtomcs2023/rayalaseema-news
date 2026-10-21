// Browser smoke of the trending desk against a local admin dev server:
//   cd apps/admin && bunx tsx scripts/video-iq-local/ui-smoke-trending.mts <creds.json> <out-dir>
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [credsPath, outDir] = process.argv.slice(2);
if (!credsPath || !outDir) throw new Error("usage: ui-smoke-trending.mts <creds.json> <out-dir>");
const creds = JSON.parse(readFileSync(credsPath, "utf8")) as { email: string; password: string };
const BASE = process.env.ADMIN_BASE_URL || "http://localhost:3001";
const log = (m: string) => console.log(new Date().toISOString().slice(11, 19), m);

const browser = await chromium.launch({ timeout: 30_000 });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#identifier", creds.email);
  await page.fill("#password", creds.password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  log("logged in");

  await page.goto(`${BASE}/trending`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.locator("table tbody tr").first().waitFor({ timeout: 60_000 });
  const rows = await page.locator("table tbody tr").count();
  log(`videos view: ${rows} rows`);
  await page.screenshot({ path: join(outDir, "ui-trending-videos.png") });

  await page.getByLabel("Rayalaseema towns only").check();
  await page.waitForTimeout(1500);
  const localRows = await page.locator("table tbody tr").count();
  log(`local only: ${localRows} rows`);
  await page.screenshot({ path: join(outDir, "ui-trending-local.png") });

  await page.getByRole("button", { name: "Stories across channels" }).click();
  await page.waitForTimeout(1500);
  log("clusters view shown");
  await page.screenshot({ path: join(outDir, "ui-trending-clusters.png") });

  // Create story from the first local video, land in the editor.
  await page.getByRole("button", { name: "Videos", exact: true }).click();
  await page.waitForTimeout(800);
  await page.locator("table tbody tr").first().getByRole("button", { name: "Create story" }).click();
  await page.waitForURL(/\/content\//, { timeout: 60_000 });
  log(`create story → ${page.url()}`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(outDir, "ui-trending-draft.png") });
} finally {
  await browser.close();
}
