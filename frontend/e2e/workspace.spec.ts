import { test, expect } from "@playwright/test";
import { choose, instantSteps, open, send } from "./helpers";

test.beforeEach(instantSteps);

test("the session cookie ends with the browser", async ({ page, context }) => {
  await open(page);
  const cookie = (await context.cookies()).find(
    (c) => c.name === "payout_workspace",
  );
  // A session cookie has no expiry date, so it is removed when the browser closes.
  expect(cookie?.expires).toBe(-1);
  await expect(page.getByText(/Demo · test funds/)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("refreshing the page starts from scratch", async ({ page }) => {
  await open(page);
  await send(page, "SUCCESS");
  await expect(page.locator(".payment-row")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".connection")).toHaveText("Connected");
  await expect(page.locator(".payment-row")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Ledger" })).toContainText(
    "No entries yet.",
  );
  await expect(page.locator(".run")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("two tabs in one browser are separate workspaces", async ({ context }) => {
  const first = await context.newPage();
  await open(first);
  await send(first, "SUCCESS");
  const second = await context.newPage();
  await open(second);
  // Opening the second tab leaves the first one alone.
  await expect(second.locator(".payment-row")).toHaveCount(0);
  await expect(first.locator(".payment-row")).toHaveCount(1);
  await send(second, "DECLINED");
  await expect(second.locator(".payment-row")).toHaveCount(1);
  await expect(second.locator(".payment-status")).toHaveText("FAILED");
  await expect(first.locator(".payment-status")).toHaveText("SUCCEEDED");
  // The first tab keeps working with no dialog and no lost history.
  await send(first, "SUCCESS");
  await expect(first.locator(".payment-row")).toHaveCount(2);
  await expect(first.getByRole("dialog")).toHaveCount(0);
  await expect(second.locator(".payment-row")).toHaveCount(1);
});

test("a lost creation response is retried automatically with the same key", async ({
  page,
}) => {
  await open(page);
  const keys: string[] = [];
  let lost = false;
  await page.route("**/api/v1/payouts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (!lost) {
      lost = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  await expect(page.locator("li.final")).toContainText("Result: SUCCEEDED", {
    timeout: 30000,
  });
  await expect(page.locator(".payment-row")).toHaveCount(1);
  await expect(page.locator(".payment-status")).toHaveText("SUCCEEDED");
  // The first attempt created the payment, the retry and the final repeat reused its key.
  expect(keys.length).toBeGreaterThanOrEqual(2);
  expect(new Set(keys).size).toBe(1);
});

test("backend startup failures recover automatically", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/v1/workspace*", (route) => {
    requests++;
    return requests <= 2
      ? route.fulfill({ status: 503, body: "starting" })
      : route.continue();
  });
  await page.goto("/");
  await expect(
    page.getByText("Connecting to the payment server", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".connection")).toHaveText("Connected", {
    timeout: 20000,
  });
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
});

test("an expired session renews without resending a payment", async ({
  page,
}) => {
  await open(page);
  await send(page, "SUCCESS");
  // End this tab's workspace on the server, as the inactivity limit does.
  await page.evaluate(async () => {
    const id = sessionStorage.getItem("payment-simulator-workspace")!;
    await fetch("/api/v1/workspace?reset=true", {
      method: "POST",
      headers: { "X-Workspace-Id": id },
    });
  });
  await page.locator(".payment-summary").click();
  await expect(page.locator(".connection")).toHaveText("Connected");
  await expect(page.locator(".payment-row")).toHaveCount(0);
  const dialog = page.getByRole("dialog", { name: "Session expired" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("inactive for too long");
  // It stays until the visitor acknowledges it.
  await page.waitForTimeout(1500);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
});

test("separate browser sessions cannot inspect another visitor payment", async ({
  page,
  browser,
}) => {
  await open(page);
  const payout = await send(page, "SUCCESS");
  const other = await browser.newContext();
  const tab = await other.newPage();
  await tab.goto(page.url());
  await expect(tab.locator(".connection")).toHaveText("Connected");
  const response = await tab.request.get(
    new URL(`/api/v1/payouts/${payout.id}/snapshot`, page.url()).toString(),
  );
  expect(response.status()).toBe(404);
  await other.close();
});

test("a lost processing response recovers automatically without a second submission", async ({
  page,
}) => {
  await open(page);
  await choose(page, "SUCCESS");
  let calls = 0;
  await page.route("**/api/v1/payouts/*/process", async (route) => {
    calls++;
    await route.fetch();
    await route.abort();
  });
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  await expect(page.locator("li.final")).toContainText("Result: SUCCEEDED", {
    timeout: 30000,
  });
  expect(calls).toBe(1);
  await expect(page.locator(".payment-row")).toHaveCount(1);
  await expect(page.locator(".payment-status")).toHaveText("SUCCEEDED");
  await expect(page.getByRole("button", { name: /Resume/ })).toHaveCount(0);
});

test("clear history starts a fresh workspace", async ({ page }) => {
  await open(page);
  await send(page, "SUCCESS");
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await expect(page.locator(".payment-row")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await send(page, "DECLINED");
  await expect(page.locator(".payment-row")).toHaveCount(1);
});
