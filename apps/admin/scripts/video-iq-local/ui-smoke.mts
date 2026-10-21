// Browser smoke of the Video IQ panel against a local admin dev server
// (plan Task 18 / reviewer I6). Runs under Node so Playwright can launch:
//   cd apps/admin && bunx tsx scripts/video-iq-local/ui-smoke.mts <creds.json> <contentId> <step> <out-dir>
// step = "optimize" (login, open the editor, click Optimize, screenshot the
// working state) or "publish" (login, wait READY, Save, Approve, Publish via
// the confirm dialog, screenshot the result). The worker is driven between
// the two steps by calling /api/cron/video-iq with CRON_SECRET.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [credsPath, contentId, step, outDir] = process.argv.slice(2);
if (!credsPath || !contentId || !step || !outDir) throw new Error("usage: ui-smoke.mts <creds.json> <contentId> optimize|publish <out-dir>");
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
  log(`logged in → ${page.url()}`);

  await page.goto(`${BASE}/content/${contentId}`, { waitUntil: "networkidle", timeout: 180_000 });
  const panel = page.locator("text=Video IQ").first();
  await panel.waitFor({ timeout: 60_000 });
  log("editor open, panel present");

  if (step === "optimize") {
    await page.getByRole("button", { name: /Optimize|Re-run/ }).first().click();
    await page.waitForTimeout(2500);
    const text = await page.locator("div:has(> strong:text('Video IQ'))").first().innerText().catch(() => "");
    log(`panel: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
    await page.screenshot({ path: join(outDir, "ui-1-queued.png"), fullPage: false });
  }

  if (step === "publish") {
    await page.locator("text=READY").first().waitFor({ timeout: 60_000 });
    log("panel READY");
    await page.screenshot({ path: join(outDir, "ui-2-ready.png") });
    // Pick title 2 so a real edit is saved, then the tabs.
    await page.locator("input[name=viq-title]").nth(1).check();
    await page.getByRole("button", { name: "Save" }).click();
    await page.locator("text=Choice saved").waitFor({ timeout: 20_000 });
    log("saved choice (title 2)");
    for (const tab of ["Thumbnail", "SEO", "Review", "Publish"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(outDir, `ui-tab-${tab.toLowerCase()}.png`) });
    }
    await page.getByRole("button", { name: "Approve" }).click();
    await page.locator("text=Approved for YouTube").waitFor({ timeout: 20_000 });
    log("approved");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("dialog").waitFor({ timeout: 10_000 });
    await page.screenshot({ path: join(outDir, "ui-3-confirm.png") });
    await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
    await page.locator("text=/Dry run: DRYRUN00000|Published:/").waitFor({ timeout: 120_000 });
    log("published (dry run)");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "ui-4-applied.png") });
    const status = await page.locator("text=APPLIED").first().innerText().catch(() => "no APPLIED chip");
    log(`status chip: ${status}`);
  }
} finally {
  await browser.close();
}
