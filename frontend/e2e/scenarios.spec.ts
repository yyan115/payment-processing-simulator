import { test, expect } from "@playwright/test";
import { choose, instantSteps, names, open, send } from "./helpers";

test.beforeEach(instantSteps);

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
    const paragraphs = await text.locator("p").count();
    expect(paragraphs).toBeGreaterThanOrEqual(2);
    expect(paragraphs).toBeLessThanOrEqual(3);
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

test("no scenario paragraph runs past four lines", async ({ page }) => {
  await open(page);
  for (const id of Object.keys(names)) {
    await choose(page, id);
    const lines = await page
      .locator(".scenario-explanation p")
      .evaluateAll((paragraphs) =>
        paragraphs.map(
          (p) =>
            p.getBoundingClientRect().height /
            parseFloat(getComputedStyle(p).lineHeight),
        ),
      );
    for (const count of lines) expect(Math.round(count)).toBeLessThanOrEqual(4);
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
