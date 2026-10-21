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
    await page.getByTestId("viq-optimize").click();
    await page.waitForTimeout(2500);
    const text = await page.locator("div:has(> strong:text('Video IQ'))").first().innerText().catch(() => "");
    log(`panel: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
    await page.screenshot({ path: join(outDir, "ui-1-queued.png"), fullPage: false });
  }

  if (step === "publish") {
    await page.locator("text=/^(READY|APPROVED)$/").first().waitFor({ timeout: 60_000 });
    log(`panel ${await page.locator("text=/^(READY|APPROVED)$/").first().innerText()}`);
    await page.screenshot({ path: join(outDir, "ui-2-ready.png") });
    // Pick a title that is not currently selected so a real edit is saved, then the tabs.
    const radios = page.locator("input[name=viq-title]");
    const pick = (await radios.nth(1).isChecked()) ? 0 : 1;
    await radios.nth(pick).check();
    await page.getByTestId("viq-save").click();
    await page.locator("text=Choice saved").waitFor({ timeout: 20_000 });
    log(`saved choice (title ${pick + 1})`);
    for (const tab of ["thumbnail", "seo", "review", "publish"]) {
      await page.getByTestId(`viq-tab-${tab}`).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(outDir, `ui-tab-${tab}.png`) });
    }
    await page.getByTestId("viq-approve").click();
    await page.locator("text=Approved for YouTube").waitFor({ timeout: 20_000 });
    log("approved");
    const publishBtn = page.getByTestId("viq-publish");
    await publishBtn.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1000);
    const gate = (await publishBtn.getAttribute("title")) ?? "";
    log(`publish gate: ${gate || "(open)"}`);
    if (/not a fit/i.test(gate)) {
      // The fit gate: an ADMIN records why the video may go out anyway.
      await page.getByTestId("viq-tab-review").click();
      await page.getByPlaceholder(/Why publish anyway/).fill("browser smoke: owner accepts this clip for the test channel run");
      await page.getByRole("button", { name: "Record override" }).click();
      await page.locator("text=Override recorded").waitFor({ timeout: 20_000 });
      log("admin override recorded");
      await page.screenshot({ path: join(outDir, "ui-3b-override.png") });
    }
    await publishBtn.click({ timeout: 30_000 }); // auto-waits until enabled
    const dialog = page.getByRole("alertdialog"); // confirm-dialog.tsx renders a shadcn AlertDialog
    await dialog.waitFor({ timeout: 10_000 });
    log(`dialog: ${(await dialog.innerText()).replace(/\s+/g, " ").slice(0, 160)}`);
    await page.screenshot({ path: join(outDir, "ui-3-confirm.png") });
    await dialog.getByRole("button", { name: "Publish" }).click();
    await page.locator("text=/Dry run: DRYRUN00000|Published:/").first().waitFor({ timeout: 120_000 });
    log("published (dry run)");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "ui-4-applied.png") });
    const status = await page.locator("text=APPLIED").first().innerText().catch(() => "no APPLIED chip");
    log(`status chip: ${status}`);
  }

  if (step === "view") {
    await page.locator("text=/^(READY|APPROVED|APPLIED|FAILED)$/").first().waitFor({ timeout: 60_000 });
    log(`panel ${await page.locator("text=/^(READY|APPROVED|APPLIED|FAILED)$/").first().innerText()}`);
    await page.getByTestId("viq-tab-publish").click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(outDir, "ui-4-applied.png") });
    log(`publish tab: ${(await page.locator("div:has(> strong:text('Video IQ'))").first().innerText()).replace(/\s+/g, " ").slice(0, 300)}`);
  }
} finally {
  await browser.close();
}
