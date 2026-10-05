#!/usr/bin/env node
// Records the README GIF from a running app and writes docs/images/demo.gif.
// It needs the app on http://localhost:8080 (or another URL as the first argument), ffmpeg and
// the Playwright Chromium browser.
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
const context = await browser.newContext({
  viewport: size,
  recordVideo: { dir: tmp, size },
});
const page = await context.newPage();
await page.goto(base);
await page.locator(".connection").getByText("Connected").waitFor();
await page.getByRole("radio", { name: "Response lost", exact: true }).check();
await page.waitForTimeout(2500);
await page.getByRole("button", { name: "Send payment", exact: true }).click();
await page.locator(".timeline li.final").waitFor({ timeout: 60000 });
await page.waitForTimeout(3500);
await page.close();
await context.close();
await browser.close();

const video = readdirSync(tmp).find((name) => name.endsWith(".webm"));
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    join(tmp, video),
    "-vf",
    "fps=7,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
    "-loop",
    "0",
    join(out, "demo.gif"),
  ],
  { stdio: "ignore" },
);
rmSync(tmp, { recursive: true, force: true });
