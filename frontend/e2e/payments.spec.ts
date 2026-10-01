import { test, expect, type Page } from "@playwright/test";
async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator(".connection")).toHaveText("Connected");
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
}
async function send(page: Page, scenario = "TIMEOUT_AFTER_SUCCESS") {
  await page.getByLabel("Scenario", { exact: true }).selectOption(scenario);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/payouts") &&
      r.request().method() === "POST" &&
      r.status() === 201,
  );
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  const payout = await (await response).json();
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
  return payout;
}
for (const [scenario, status, ledger] of [
  ["SUCCESS", "Succeeded", true],
  ["DECLINED", "Declined", false],
  ["TIMEOUT_AFTER_SUCCESS", "Succeeded", true],
  ["TIMEOUT_BEFORE_PROCESSING", "Succeeded", true],
  ["PENDING", "Succeeded", true],
  ["UNKNOWN", "Unresolved", false],
] as const) {
  test(`automatic scenario ${scenario}`, async ({ page }) => {
    await open(page);
    const payout = await send(page, scenario);
    const row = page.locator(".payment-row");
    await expect(row).toHaveCount(1);
    await expect(row.locator(".payment-status")).toHaveText(status);
    await row.getByRole("button").click();
    await expect(
      row.getByText("Idempotency key", { exact: true }),
    ).toBeVisible();
    await expect(row.getByText(payout.id, { exact: true })).toBeVisible();
    await expect(row.getByText(/Idempotency verified/)).toBeVisible();
    await row.getByText(/^Ledger ·/).click();
    await expect(row.locator("tbody tr")).toHaveCount(ledger ? 2 : 0);
    await page.reload();
    await expect(page.locator(".connection")).toHaveText("Connected");
    await expect(page.locator(".payment-row")).toHaveCount(1);
    await page.locator(".payment-summary").click();
    await expect(
      page
        .locator(".payment-details")
        .getByText("Idempotency key", { exact: true }),
    ).toBeVisible();
  });
}
test("multiple scenarios keep separate history and request evidence", async ({
  page,
}) => {
  await open(page);
  await send(page, "SUCCESS");
  await send(page, "DECLINED");
  await send(page, "TIMEOUT_AFTER_SUCCESS");
  await expect(page.locator(".payment-row")).toHaveCount(3);
  for (const row of await page.locator(".payment-row").all()) {
    await row.locator(".payment-summary").click();
    await expect(row.locator(".payment-details")).toBeVisible();
    await row.getByText(/^API requests ·/).click();
    await expect(
      row
        .locator("summary")
        .filter({ hasText: "POST /api/v1/payouts" })
        .first(),
    ).toBeVisible();
  }
});
test("double clicks create one payment", async ({ page }) => {
  await open(page);
  await page.getByLabel("Scenario", { exact: true }).selectOption("SUCCESS");
  await page
    .getByRole("button", { name: "Send payment", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".payment-row")).toHaveCount(1);
});
test("participants, validation and fixed currency", async ({ page }) => {
  await open(page);
  await page.getByText("Add participant", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Participant name" })
    .fill("Dennis Morgan");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByLabel("To", { exact: true })).toHaveValue(
    "Dennis Morgan",
  );
  await expect(page.getByLabel("Amount")).toHaveValue("100.00");
  await page.getByLabel("Amount").fill("10.001");
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("decimal places");
  await expect(page.locator(".payment-row")).toHaveCount(0);
  await expect(page.getByLabel("Currency", { exact: true })).toHaveCount(0);
});
test("lost creation response resumes the same intent and key", async ({
  page,
}) => {
  await open(page);
  let lost = false;
  await page.route("**/api/v1/payouts", async (route) => {
    if (!lost && route.request().method() === "POST") {
      lost = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume unfinished request" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume unfinished request" }).click();
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".payment-row")).toHaveCount(1);
  await expect(page.locator(".payment-status")).toHaveText("Succeeded");
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
test("missing session renews without resending a payment", async ({
  page,
  context,
}) => {
  await open(page);
  await send(page, "SUCCESS");
  await context.clearCookies();
  await page.locator(".payment-summary").click();
  await expect(page.locator(".connection")).toHaveText("Connected");
  await expect(page.locator(".payment-row")).toHaveCount(0);
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
test("mobile layout and icon theme toggle persist", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await send(page, "SUCCESS");
  await page.locator(".payment-summary").click();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".payment-row")).toHaveCount(1);
});
test("authenticated Mastercard payout and lookup", async ({ page }) => {
  test.skip(process.env.MASTERCARD_E2E !== "true");
  await open(page);
  await page.getByLabel("Provider", { exact: true }).selectOption("mastercard");
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await expect(page.locator(".payment-status")).toHaveText("Succeeded");
  await page.locator(".payment-summary").click();
  await page.getByText(/^Ledger ·/).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
});

test("lost processing response recovers without a second submission", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Scenario", { exact: true }).selectOption("SUCCESS");
  let calls = 0;
  await page.route("**/api/v1/payouts/*/process", async (route) => {
    calls++;
    await route.fetch();
    await route.abort();
  });
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume unfinished request" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume unfinished request" }).click();
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
  expect(calls).toBe(1);
  await expect(page.locator(".payment-row")).toHaveCount(1);
  await expect(page.locator(".payment-status")).toHaveText("Succeeded");
});
test("unfinished request survives reload and preserves participant intent", async ({
  page,
}) => {
  await open(page);
  let lost = false;
  await page.route("**/api/v1/payouts", async (route) => {
    if (!lost && route.request().method() === "POST") {
      lost = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume unfinished request" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".connection")).toHaveText("Connected");
  await page.getByLabel("To", { exact: true }).selectOption("Alex Morgan");
  await page.getByRole("button", { name: "Resume unfinished request" }).click();
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".payment-row")).toHaveCount(1);
  await expect(page.locator(".payment-summary")).toContainText("John Lim");
});
test("clear history starts a fresh workspace", async ({ page }) => {
  await open(page);
  await send(page, "SUCCESS");
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await expect(page.locator(".payment-row")).toHaveCount(0);
  await send(page, "DECLINED");
  await expect(page.locator(".payment-row")).toHaveCount(1);
});
test("Mastercard configuration removes simulator scenarios", async ({
  page,
}) => {
  await page.route("**/api/v1/config", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({
      response,
      json: { ...json, mastercardAvailable: true },
    });
  });
  await open(page);
  await page.getByLabel("Provider", { exact: true }).selectOption("mastercard");
  await expect(page.getByLabel("Scenario", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Amount")).toHaveValue("53.00");
  await expect(page.getByText(/Official sandbox test accounts/)).toBeVisible();
  await page.getByLabel("Provider", { exact: true }).selectOption("simulated");
  await expect(page.getByLabel("Scenario", { exact: true })).toBeVisible();
});

test("bot verification gates Mastercard, supports retry and leaves simulation open", async ({
  page,
}) => {
  await page.route("**/api/v1/config", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), mastercardAvailable: true },
    });
  });
  let verified = false;
  let submissions = 0;
  await page.route("**/api/v1/sandbox-verification", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({
        token: "fixture-token",
      });
      if (++submissions === 1) {
        await route.fulfill({
          status: 403,
          json: { message: "Verification failed. Please try again." },
        });
        return;
      }
      verified = true;
    }
    await route.fulfill({
      json: { required: true, siteKey: "fixture-public", verified },
    });
  });
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `window.turnstile = {
    render(node, options) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = 'Complete test verification';
      button.onclick = () => options.callback('fixture-token');
      node.appendChild(button); window.fixtureWidget = node; return 'fixture-widget';
    },
    remove() { window.fixtureWidget?.replaceChildren(); }
  };`,
      }),
  );
  await open(page);
  const sendButton = page.getByRole("button", {
    name: "Send payment",
    exact: true,
  });
  await page.getByLabel("Provider", { exact: true }).selectOption("mastercard");
  await expect(sendButton).toBeDisabled();
  await page.getByLabel("Provider", { exact: true }).selectOption("simulated");
  await expect(sendButton).toBeEnabled();
  await page.getByLabel("Provider", { exact: true }).selectOption("mastercard");
  await page
    .getByRole("button", { name: "Complete test verification" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Verification failed");
  await expect(sendButton).toBeDisabled();
  await page.getByRole("button", { name: "Retry verification" }).click();
  await page
    .getByRole("button", { name: "Complete test verification" })
    .click();
  await expect(
    page.getByText("Session verified", { exact: true }),
  ).toBeVisible();
  await expect(sendButton).toBeEnabled();
  await page.reload();
  await page.getByLabel("Provider", { exact: true }).selectOption("mastercard");
  await expect(
    page.getByText("Session verified", { exact: true }),
  ).toBeVisible();
  await expect(sendButton).toBeEnabled();
});
