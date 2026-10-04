#!/usr/bin/env node
// Regenerates the README media from a running app: docs/images/demo.gif, simulator.png and records.png.
// Needs the app on http://localhost:8080 (or pass another URL), plus ffmpeg and Playwright's Chromium.
//   node scripts/readme-media.mjs [base-url]
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(new URL("../frontend/", import.meta.url));
const { chromium } = require("@playwright/test");

const base = process.argv[2] ?? "http://localhost:8080";
const out = new URL("../docs/images/", import.meta.url).pathname;
const tmp = join(out, ".video");
const size = { width: 1280, height: 800 };
mkdirSync(tmp, { recursive: true });

const browser = await chromium.launch();

async function open(context) {
  const page = await context.newPage();
  await page.goto(base);
  await page.locator(".connection").getByText("Connected").waitFor();
  return page;
}
const choose = (page, name) => page.getByRole("radio", { name, exact: true }).check();
const send = (page) => page.getByRole("button", { name: "Send payment", exact: true }).click();

// The GIF: one scenario at the normal pace.
const recording = await browser.newContext({
  viewport: size,
  recordVideo: { dir: tmp, size },
});
{
  const page = await open(recording);
  await choose(page, "Response lost");
  await page.waitForTimeout(2500);
  await send(page);
  await page.locator(".timeline li.final").waitFor({ timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.close();
  await recording.close();
}
const video = readdirSync(tmp).find((name) => name.endsWith(".webm"));
execFileSync("ffmpeg", [
  "-y", "-i", join(tmp, video),
  "-vf",
  "fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
  "-loop", "0", join(out, "demo.gif"),
], { stdio: "ignore" });
rmSync(tmp, { recursive: true, force: true });

// The screenshots: instant pace, so the run finishes straight away.
const still = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
await still.addInitScript(() => localStorage.setItem("payment-simulator-pace", "0"));
{
  const page = await open(still);
  await choose(page, "Response lost");
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, "simulator.png") });
  await send(page);
  await page.locator(".timeline li.final").waitFor();
  await page.locator(".payment-summary").first().click();
  await page.locator(".payment-details").first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  // The trace, History and Ledger, without the footer.
  const below = await page.locator(".below").boundingBox();
  const books = await page.locator(".books").boundingBox();
  await page.screenshot({
    path: join(out, "records.png"),
    fullPage: true,
    clip: { ...below, height: books.y + books.height - below.y + 8 },
  });
}
await browser.close();
