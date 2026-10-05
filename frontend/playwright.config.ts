import { defineConfig } from "@playwright/test";
const remote = Boolean(process.env.E2E_BASE_URL);
export default defineConfig({
  testDir: "./e2e",
  // The exhaustive matrix is slow, so it runs only on request with npm run test:matrix.
  testIgnore: process.env.MATRIX ? [] : "**/matrix.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: remote ? 90_000 : 45_000,
  expect: { timeout: remote ? 30_000 : 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --port 5173 --strictPort",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !process.env.CI,
      },
});
