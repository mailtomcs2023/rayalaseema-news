// Browser smoke of the YouTube studio screens against a local admin dev server:
//   cd apps/admin && bunx tsx scripts/video-iq-local/ui-smoke-studio.mts <creds.json> <clip.mp4> <step> <out-dir>
// step = "catalog" (login, /youtube grid + insights tab, screenshots)
//      | "upload"  (login, /youtube/new, upload the clip via SAS, start, print the run url)
//      | "publish" (login, open <out-dir>/studio-run.json's run, wait READY, Save/Approve/Publish dry-run, Create website article)
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [credsPath, clip, step, outDir] = process.argv.slice(2);
if (!credsPath || !clip || !step || !outDir) throw new Error("usage: ui-smoke-studio.mts <creds.json> <clip.mp4> catalog|upload|publish <out-dir>");
const creds = JSON.parse(readFileSync(credsPath, "utf8")) as { email: string; password: string };
const BASE = process.env.ADMIN_BASE_URL || "http://localhost:3001";
const log = (m: string) => console.log(new Date().toISOString().slice(11, 19), m);
const runFile = join(outDir, "studio-run.json");

const browser = await chromium.launch({ timeout: 30_000 });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.fill("#identifier", creds.email);
  await page.fill("#password", creds.password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
  log("logged in");

  if (step === "catalog") {
    await page.goto(`${BASE}/youtube`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.locator("text=/Catalog synced|No videos in the catalog/").first().waitFor({ timeout: 90_000 });
    const cards = await page.locator("div:has(> a[href*='youtube.com/watch'], > a[href^='/youtube/'])").count();
    log(`catalog: ${cards} cards`);
    await page.screenshot({ path: join(outDir, "studio-1-catalog.png") });
    await page.selectOption("select", "opportunities");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "studio-1b-opportunities.png") });
    await page.getByRole("button", { name: "Shorts" }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "studio-1c-shorts.png") });
    await page.getByRole("button", { name: "Channel insights" }).click();
    await page.locator("text=Where views come from").waitFor({ timeout: 60_000 });
    await page.screenshot({ path: join(outDir, "studio-1d-insights.png") });
    log("insights rendered");
  }

  if (step === "upload") {
    await page.goto(`${BASE}/youtube/new`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.setInputFiles("input[type=file]", clip);
    await page.locator("text=uploaded · click to replace").waitFor({ timeout: 300_000 });
    log("clip uploaded to blob via SAS");
    await page.getByTestId("yt-desk-title").fill("ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై దాడి");
    await page.getByRole("checkbox").first().check(); // breaking
    await page.screenshot({ path: join(outDir, "studio-2-new.png") });
    await page.getByTestId("yt-start").click();
    await page.waitForURL(/\/youtube\/(?!new$)[a-z0-9]+$/, { timeout: 60_000 });
    const runId = page.url().split("/").pop()!;
    writeFileSync(runFile, JSON.stringify({ runId }));
    log(`run created → ${page.url()}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "studio-3-progress.png") });
  }

  if (step === "publish") {
    if (!existsSync(runFile)) throw new Error("run the upload step first");
    const { runId } = JSON.parse(readFileSync(runFile, "utf8"));
    await page.goto(`${BASE}/youtube/${runId}`, { waitUntil: "networkidle", timeout: 180_000 });
    await page.locator("text=/^(READY|APPROVED)$/").first().waitFor({ timeout: 300_000 });
    log("workspace READY");
    await page.screenshot({ path: join(outDir, "studio-4-ready.png") });
    const radios = page.locator("input[name=viq-title]");
    const pick = (await radios.nth(1).isChecked()) ? 0 : 1;
    await radios.nth(pick).check();
    await page.getByTestId("viq-tab-publish").click();
    await page.getByLabel("Private").check();
    await page.getByTestId("viq-save").click();
    await page.locator("text=Choice saved").waitFor({ timeout: 20_000 });
    log(`saved title ${pick + 1}, visibility private`);
    await page.getByTestId("viq-approve").click();
    await page.locator("text=Approved").first().waitFor({ timeout: 20_000 });
    const publishBtn = page.getByTestId("viq-publish");
    await page.waitForTimeout(800);
    const gate = (await publishBtn.getAttribute("title")) ?? "";
    log(`publish gate: ${gate || "(open)"}`);
    if (/not a fit/i.test(gate)) {
      await page.getByTestId("viq-tab-review").click();
      await page.getByPlaceholder(/Why publish anyway/).fill("studio smoke: owner accepts this clip");
      await page.getByRole("button", { name: "Record override" }).click();
      await page.locator("text=Override recorded").waitFor({ timeout: 20_000 });
    }
    await publishBtn.click({ timeout: 30_000 });
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor({ timeout: 10_000 });
    log(`dialog: ${(await dialog.innerText()).replace(/\s+/g, " ").slice(0, 160)}`);
    await dialog.getByRole("button", { name: "Publish" }).click();
    await page.locator("text=/Dry run: DRYRUN00000|Published:/").first().waitFor({ timeout: 180_000 });
    log("published (dry run)");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "studio-5-applied.png") });
    await page.getByTestId("viq-create-article").click();
    await page.waitForURL(/\/content\//, { timeout: 60_000 });
    log(`create article → ${page.url()}`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(outDir, "studio-6-article.png") });
    const url = await page.inputValue("input[placeholder*='video URL'], input[value*='youtube.com']").catch(() => "");
    log(`article video url field: ${url}`);
  }
} finally {
  await browser.close();
}
