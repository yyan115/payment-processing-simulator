import { test, expect, type Page } from "@playwright/test";
const names: Record<string, string> = {
  SUCCESS: "Approved payment",
  DECLINED: "Declined payment",
  TIMEOUT_AFTER_SUCCESS: "Response lost",
  TIMEOUT_BEFORE_PROCESSING: "Request lost",
  PENDING: "Pending payment",
  UNKNOWN: "Unknown outcome",
};
const choose = (page: Page, scenario: string) =>
  page.getByRole("radio", { name: names[scenario], exact: true }).check();
// Steps are paced for viewers; tests skip the wait unless they test the pacing.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("payment-simulator-pace", "0"),
  );
});
async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator(".connection")).toHaveText("Connected");
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
}
async function send(page: Page, scenario = "TIMEOUT_AFTER_SUCCESS") {
  await choose(page, scenario);
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
for (const [scenario, status, ledger, story, final] of [
  [
    "SUCCESS",
    "SUCCEEDED",
    true,
    "The network approved the payment",
    "Result: SUCCEEDED",
  ],
  [
    "DECLINED",
    "FAILED",
    false,
    "The network declined the payment",
    "Result: FAILED",
  ],
  [
    "TIMEOUT_AFTER_SUCCESS",
    "SUCCEEDED",
    true,
    "its response was lost",
    "Result: SUCCEEDED",
  ],
  [
    "TIMEOUT_BEFORE_PROCESSING",
    "SUCCEEDED",
    true,
    "so no money moved and it is safe to send again",
    "Result: SUCCEEDED",
  ],
  ["PENDING", "SUCCEEDED", true, "still being processed", "Result: SUCCEEDED"],
  [
    "UNKNOWN",
    "UNKNOWN",
    false,
    "still cannot report a result",
    "Result: UNKNOWN",
  ],
] as const) {
  test(`automatic scenario ${scenario}`, async ({ page }) => {
    await open(page);
    const payout = await send(page, scenario);
    const trace = page.getByRole("region", { name: "Payment progress" });
    await expect(trace).toContainText(story);
    await expect(trace.locator("li.final")).toContainText(final);
    await expect(trace.locator("li.final")).toHaveCount(1);
    await expect(trace).toContainText("Duplicate protection");
    await expect(trace).toContainText("idempotency key");
    await expect(page.getByRole("button", { name: /^What is/ })).toHaveCount(0);
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
    await expect(page.getByText(/inactivity/)).toHaveCount(0);
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
  await choose(page, "SUCCESS");
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
test("three fixed participants; sender and recipient can never match", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByText("Add participant")).toHaveCount(0);
  const from = page.getByLabel("From", { exact: true });
  const to = page.getByLabel("To", { exact: true });
  await expect(from.locator("option")).toHaveText([
    "Jane Tan",
    "John Lim",
    "Alex Morgan",
  ]);
  for (const sender of ["Jane Tan", "John Lim", "Alex Morgan"]) {
    await from.selectOption(sender);
    const options = await to.locator("option").allTextContents();
    expect(options).toHaveLength(2);
    expect(options).not.toContain(sender);
    expect(await to.inputValue()).not.toBe(sender);
  }
  await from.selectOption("Jane Tan");
  await to.selectOption("John Lim");
  await from.selectOption("John Lim");
  await expect(to).not.toHaveValue("John Lim");
});
test("amount validation and fixed currency", async ({ page }) => {
  await open(page);
  await expect(page.getByLabel("Amount")).toHaveValue("100.00");
  await page.getByLabel("Amount").fill("10.001");
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("decimal places");
  await expect(page.locator(".payment-row")).toHaveCount(0);
  await expect(page.getByLabel("Currency", { exact: true })).toHaveCount(0);
});
test("each scenario is explained in plain prose before it is run", async ({
  page,
}) => {
  await open(page);
  const text = page.locator(".scenario-explanation");
  await choose(page, "TIMEOUT_AFTER_SUCCESS");
  await expect(text).toHaveCount(1);
  await expect(text).toContainText(
    "Jane Tan sends John Lim SGD 100.00. The payment network completes the payment",
  );
  await expect(text).toContainText("records the payment as UNKNOWN");
  await expect(text).toContainText("reconciles");
  await expect(text).toContainText("reference");
  await expect(text).toContainText("John Lim twice");
  await page.getByLabel("From", { exact: true }).selectOption("Alex Morgan");
  await page.getByLabel("Amount").fill("42.50");
  await expect(text).toContainText("Alex Morgan sends");
  await expect(text).toContainText("SGD 42.50");
  await choose(page, "SUCCESS");
  await expect(text).toContainText("idempotency key");
  await expect(text).toContainText("ledger");
  for (const id of Object.keys(names)) {
    await choose(page, id);
    await expect(text).toHaveCount(1);
    expect((await text.textContent())!.length).toBeGreaterThan(120);
  }
  await expect(page.getByText("What happens", { exact: true })).toHaveCount(0);
});
test("response lost: the network shows completed while the platform shows UNKNOWN", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() =>
    localStorage.setItem("payment-simulator-pace", "600"),
  );
  await choose(page, "TIMEOUT_AFTER_SUCCESS");
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  const flow = page.getByRole("group", { name: "Payment flow" });
  const platform = flow.locator(".party").first();
  const network = flow.locator(".party").nth(1);
  await expect(platform).toContainText("Payment platform");
  await expect(network).toContainText("Payment network");
  // The moment the platform cannot tell what happened, the network's record is already complete.
  await expect
    .poll(
      async () =>
        `${await platform.locator(".chip").first().textContent()}|${await network.locator(".chip").textContent()}`,
      { intervals: [50], timeout: 20000 },
    )
    .toBe("UNKNOWN|Payment completed");
  await expect(flow.locator(".message.lost")).toHaveCount(1);
  await expect(platform.locator(".chip").first()).toHaveText("SUCCEEDED", {
    timeout: 20000,
  });
  await expect(platform.locator(".chip").nth(1)).toHaveText("2 entries posted");
  await expect(page.locator("li.final")).toContainText("Result: SUCCEEDED");
});
test("request lost: the request is shown not arriving", async ({ page }) => {
  await open(page);
  await page.evaluate(() =>
    localStorage.setItem("payment-simulator-pace", "600"),
  );
  await choose(page, "TIMEOUT_BEFORE_PROCESSING");
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  const flow = page.getByRole("group", { name: "Payment flow" });
  await expect(flow.locator(".message.to-network.lost")).toHaveCount(1);
  await expect(flow.locator(".party").nth(1).locator(".chip")).toHaveText(
    "No record",
  );
  await expect(page.locator("li.final")).toContainText("Result: SUCCEEDED", {
    timeout: 20000,
  });
  await expect(page.getByText("Payment sent again")).toBeVisible();
});
test("steps appear one at a time, not all at once", async ({ page }) => {
  await open(page);
  await page.evaluate(() =>
    localStorage.setItem("payment-simulator-pace", "500"),
  );
  await choose(page, "TIMEOUT_AFTER_SUCCESS");
  const send = page.getByRole("button", { name: "Send payment", exact: true });
  const items = page.locator(".timeline li");
  await send.click();
  await expect(page.getByRole("button", { name: "Processing…" })).toBeVisible();
  const seen = new Set<number>();
  const busy = page.getByRole("button", { name: "Processing…" });
  await expect
    .poll(
      async () => {
        seen.add(await items.count());
        return busy.count();
      },
      { intervals: [50], timeout: 20000 },
    )
    .toBe(0);
  expect(seen.size).toBeGreaterThanOrEqual(4);
  expect(Math.min(...[...seen].filter(Boolean))).toBeLessThanOrEqual(2);
});
test("the session lasts until the browser closes", async ({
  page,
  context,
}) => {
  await open(page);
  const cookie = (await context.cookies()).find(
    (c) => c.name === "payout_workspace",
  );
  // A session cookie has no expiry date, so it is removed when the browser closes.
  expect(cookie?.expires).toBe(-1);
  await expect(page.getByText(/Demo · test funds/)).toHaveCount(0);
  await expect(page.getByText(/expired/i)).toHaveCount(0);
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
  await expect(page.locator(".payment-status")).toHaveText("SUCCEEDED");
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
    page.getByRole("status").filter({ hasText: "inactivity" }),
  ).toBeVisible();
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
  await page
    .getByLabel("Payment network", { exact: true })
    .selectOption("mastercard");
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
  const lookup = page.waitForResponse(
    (response) =>
      /\/api\/v1\/payouts\/[^/]+\/provider$/.test(response.url()) &&
      response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await expect(page.locator(".payment-status")).toHaveText("SUCCEEDED");
  const observed = await lookup;
  expect(observed.status()).toBe(200);
  expect((await observed.json()).provider.status).toBe("SUCCEEDED");
  await page.locator(".payment-summary").click();
  await page.getByText(/^Ledger ·/).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
});

test("lost processing response recovers without a second submission", async ({
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
  await expect(
    page.getByRole("button", { name: "Resume unfinished request" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume unfinished request" }).click();
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
  expect(calls).toBe(1);
  await expect(page.locator(".payment-row")).toHaveCount(1);
  await expect(page.locator(".payment-status")).toHaveText("SUCCEEDED");
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
  await expect(page.getByText(/inactivity/)).toHaveCount(0);
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
  await page
    .getByLabel("Payment network", { exact: true })
    .selectOption("mastercard");
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByLabel("Amount")).toHaveValue("53.00");
  await expect(
    page.getByText(/Mastercard.s sandbox, a test environment/),
  ).toBeVisible();
  await page
    .getByLabel("Payment network", { exact: true })
    .selectOption("simulated");
  await expect(page.getByRole("radio")).toHaveCount(6);
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
  await page
    .getByLabel("Payment network", { exact: true })
    .selectOption("mastercard");
  await expect(sendButton).toBeDisabled();
  await page
    .getByLabel("Payment network", { exact: true })
    .selectOption("simulated");
  await expect(sendButton).toBeEnabled();
  await page
    .getByLabel("Payment network", { exact: true })
    .selectOption("mastercard");
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
  await page
    .getByLabel("Payment network", { exact: true })
    .selectOption("mastercard");
  await expect(
    page.getByText("Session verified", { exact: true }),
  ).toBeVisible();
  await expect(sendButton).toBeEnabled();
});
