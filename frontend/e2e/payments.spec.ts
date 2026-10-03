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
    await expect(row.getByText(/^Journal entry ·/)).toHaveText(
      ledger ? /· posted$/ : /· not posted$/,
    );
    await row.getByText(/^Journal entry ·/).click();
    await expect(row.locator(".journal-lines li")).toHaveCount(ledger ? 2 : 0);
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
    "Sarah Lim",
    "Daniel Wong",
    "Rachel Koh",
  ]);
  for (const sender of ["Sarah Lim", "Daniel Wong", "Rachel Koh"]) {
    await from.selectOption(sender);
    const options = await to.locator("option").allTextContents();
    expect(options).toHaveLength(2);
    expect(options).not.toContain(sender);
    expect(await to.inputValue()).not.toBe(sender);
  }
  await from.selectOption("Sarah Lim");
  await to.selectOption("Daniel Wong");
  await from.selectOption("Daniel Wong");
  await expect(to).not.toHaveValue("Daniel Wong");
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
    "Sarah Lim sends Daniel Wong SGD 100.00. The network approves it and moves the money",
  );
  await expect(text).toContainText("records UNKNOWN");
  await expect(text).toContainText("reconciles");
  await expect(text).toContainText("reference");
  await expect(text).toContainText("Daniel Wong could be paid twice");
  await page.getByLabel("From", { exact: true }).selectOption("Rachel Koh");
  await page.getByLabel("Amount").fill("42.50");
  await expect(text).toContainText("Rachel Koh sends");
  await expect(text).toContainText("SGD 42.50");
  await choose(page, "SUCCESS");
  await expect(text).toContainText("This is the expected outcome");
  await expect(text).toContainText("ledger");
  for (const id of Object.keys(names)) {
    await choose(page, id);
    await expect(text).toHaveCount(1);
    await expect(text.locator("p")).toHaveCount(2);
    expect((await text.textContent())!.length).toBeGreaterThan(200);
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
  await expect(platform.locator(".chip").nth(1)).toHaveText("Entry posted");
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
});
test("authenticated Mastercard payout and lookup", async ({ page }) => {
  test.skip(process.env.MASTERCARD_E2E !== "true");
  await open(page);
  await page.getByRole("button", { name: "Step by step" }).click();
  await page
    .getByLabel("Payment network", { exact: true })
    .selectOption("mastercard");
  // Stepping is for the simulated network only, so it is not offered here and never waits.
  await expect(page.getByRole("group", { name: "Playback" })).toHaveCount(0);
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
  await page.getByText(/^Journal entry ·/).click();
  await expect(page.locator(".payment-details .journal-lines li")).toHaveCount(
    2,
  );
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
    page.getByText(/Mastercard API sandbox, a test environment/),
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
});
test("step by step waits for the viewer, and Automatic carries on", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Step by step" }).click();
  await expect(
    page.getByRole("button", { name: "Step by step" }),
  ).toHaveAttribute("aria-pressed", "true");
  await choose(page, "TIMEOUT_AFTER_SUCCESS");
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  const items = page.locator(".timeline li");
  const next = page.getByRole("button", { name: "Next step" });
  await expect(items).toHaveCount(1);
  await expect(next).toBeVisible();
  // Nothing moves on its own while the viewer is reading.
  await page.waitForTimeout(1500);
  await expect(items).toHaveCount(1);
  await next.click();
  await expect(items).toHaveCount(2);
  await expect(next).toBeVisible();
  // The choice survives a reload.
  await page.getByRole("button", { name: "Automatic" }).click();
  await expect(next).toHaveCount(0);
  await expect(page.locator("li.final")).toContainText("Result: SUCCEEDED", {
    timeout: 20000,
  });
  await page.reload();
  await expect(page.locator(".connection")).toHaveText("Connected");
  await expect(page.getByRole("button", { name: "Automatic" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
test("the ledger is a book of postings with balances, apart from History", async ({
  page,
}) => {
  await open(page);
  const ledger = page.getByRole("region", { name: "Ledger" });
  const lines = ledger.locator(".postings tbody tr");
  const cards = ledger.locator(".account-card");
  await expect(ledger).toContainText("No entries yet.");
  await send(page, "SUCCESS");
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: "Cash clearing" })).toContainText(
    "SGD 100.00 credit",
  );
  await expect(
    cards.filter({ hasText: "Payable to Daniel Wong" }),
  ).toContainText("SGD 100.00 debit");
  await expect(ledger).not.toContainText("Debits equal credits");
  // Newest posting first: the credit follows the debit, so it is listed above it.
  await expect(lines).toHaveCount(2);
  await expect(lines.first()).toContainText("Cash clearing");
  await expect(lines.first()).toContainText("Sarah Lim → Daniel Wong");
  await expect(lines.last()).toContainText("Payable to Daniel Wong");
  // A declined payment moves no money, so the ledger does not change.
  await send(page, "DECLINED");
  await expect(lines).toHaveCount(2);
  // A second approved payment adds two postings, and the balances carry on.
  await send(page, "SUCCESS");
  await expect(lines).toHaveCount(4);
  await expect(lines.first()).toContainText("SGD 200.00 credit");
  await expect(
    cards.filter({ hasText: "Payable to Daniel Wong" }),
  ).toContainText("SGD 200.00 debit");
  // History describes payments. It has no accounting table.
  await expect(
    page.getByRole("region", { name: "Payment history" }).locator("table"),
  ).toHaveCount(0);
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await expect(ledger).toContainText("No entries yet.");
});
test("Mastercard is selectable only when it is configured, otherwise listed as unavailable", async ({
  page,
}) => {
  for (const available of [false, true]) {
    await page.route("**/api/v1/config", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        json: {
          ...(await response.json()),
          mastercardAvailable: available,
          visaAvailable: false,
        },
      });
    });
    await open(page);
    const options = page
      .getByLabel("Payment network", { exact: true })
      .locator("option");
    await expect(options).toHaveText(
      available
        ? [
            "Simulated network",
            "Mastercard API sandbox",
            "Visa API sandbox (unavailable)",
          ]
        : [
            "Simulated network",
            "Mastercard API sandbox (unavailable)",
            "Visa API sandbox (unavailable)",
          ],
    );
    if (available) {
      await expect(options.nth(1)).not.toHaveAttribute("disabled");
    } else {
      await expect(options.nth(1)).toHaveAttribute("disabled", "");
    }
    await page.unroute("**/api/v1/config");
  }
});
test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });
  test("nothing scrolls sideways and the content clears the top bar", async ({
    page,
  }) => {
    await open(page);
    await send(page, "SUCCESS");
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      barBottom: document.querySelector(".topbar")!.getBoundingClientRect()
        .bottom,
      introTop: document.querySelector(".intro")!.getBoundingClientRect().top,
      cardBottom: document.querySelector(".card")!.getBoundingClientRect()
        .bottom,
      bandBottom: document.querySelector(".hero")!.getBoundingClientRect()
        .bottom,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.introTop - layout.barBottom).toBeGreaterThanOrEqual(40);
    expect(layout.bandBottom - layout.cardBottom).toBeGreaterThanOrEqual(40);
  });
  test("step by step keeps the newest step and Next step in view", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("button", { name: "Step by step" }).click();
    await choose(page, "TIMEOUT_AFTER_SUCCESS");
    await page
      .getByRole("button", { name: "Send payment", exact: true })
      .click();
    const next = page.getByRole("button", { name: "Next step" });
    for (let step = 1; step <= 5; step++) {
      await expect(page.locator(".timeline li")).toHaveCount(step);
      await expect
        .poll(
          async () => {
            const box = await next.boundingBox();
            const view = page.viewportSize()!;
            return !!box && box.y >= 0 && box.y + box.height <= view.height;
          },
          { timeout: 5000 },
        )
        .toBe(true);
      await next.click();
    }
  });
});
test("authenticated Visa Direct payout and lookup", async ({ page }) => {
  test.skip(process.env.VISA_E2E !== "true");
  await open(page);
  await page.getByRole("button", { name: "Step by step" }).click();
  await page
    .getByLabel("Payment network", { exact: true })
    .selectOption("visa");
  await expect(page.getByRole("group", { name: "Playback" })).toHaveCount(0);
  await expect(page.getByLabel("Amount")).toHaveValue("50.00");
  const lookup = page.waitForResponse(
    (response) =>
      /\/api\/v1\/payouts\/[^/]+\/provider$/.test(response.url()) &&
      response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Send payment", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled({ timeout: 40000 });
  await expect(page.locator(".payment-status")).toHaveText("SUCCEEDED");
  const observed = await lookup;
  expect(observed.status()).toBe(200);
  expect((await observed.json()).provider.status).toBe("SUCCEEDED");
  await expect(page.locator(".flow")).toContainText("Visa API sandbox");
  await expect(page.locator(".flow .party").nth(1)).toContainText(
    "Payment completed",
  );
  await page.locator(".payment-summary").click();
  await expect(page.locator(".identifiers")).toContainText("Visa API sandbox");
  await expect(page.locator(".payment-details .journal-lines li")).toHaveCount(
    2,
  );
});
test("Visa is selectable only when it is configured, otherwise listed as unavailable", async ({
  page,
}) => {
  for (const available of [false, true]) {
    await page.route("**/api/v1/config", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        json: {
          ...(await response.json()),
          mastercardAvailable: false,
          visaAvailable: available,
        },
      });
    });
    await open(page);
    const options = page
      .getByLabel("Payment network", { exact: true })
      .locator("option");
    await expect(options).toHaveText(
      available
        ? [
            "Simulated network",
            "Mastercard API sandbox (unavailable)",
            "Visa API sandbox",
          ]
        : [
            "Simulated network",
            "Mastercard API sandbox (unavailable)",
            "Visa API sandbox (unavailable)",
          ],
    );
    await page.unroute("**/api/v1/config");
  }
});

test("a help icon explains the playback switch", async ({ page }) => {
  await open(page);
  const tip = page.getByRole("tooltip");
  await expect(tip).toBeHidden();
  await page.locator(".playback .hint").hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Automatic runs the steps by itself");
  await expect(tip).toContainText("Step by step waits for you");
});
test("the playback switch is offered for the simulated network only", async ({
  page,
}) => {
  await page.route("**/api/v1/config", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        mastercardAvailable: true,
        visaAvailable: true,
      },
    });
  });
  await open(page);
  const playback = page.getByRole("group", { name: "Playback" });
  const network = page.getByLabel("Payment network", { exact: true });
  await expect(playback).toBeVisible();
  for (const external of ["mastercard", "visa"]) {
    await network.selectOption(external);
    await expect(playback).toHaveCount(0);
    await network.selectOption("simulated");
    await expect(playback).toBeVisible();
  }
});
