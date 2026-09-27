import { test, expect, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator(".connection")).toHaveText("Backend connected");
  const introduction = page.getByRole("dialog", {
    name: "Demo session",
    exact: true,
  });
  if (await introduction.isVisible()) {
    await introduction
      .getByRole("button", { name: "Continue", exact: true })
      .click();
  }
  await expect(
    page.getByRole("button", { name: "Create payout", exact: true }),
  ).toBeEnabled();
}
async function create(page: Page, scenario = "Response lost") {
  await page.getByRole("button", { name: new RegExp(`^${scenario}`) }).click();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/payouts") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create payout", exact: true })
    .click();
  const created = await response;
  expect(created.status()).toBe(201);
  const payout = await created.json();
  await expect(
    page.getByRole("button", { name: "Send payout", exact: true }),
  ).toBeEnabled();
  return payout.id as string;
}
async function send(page: Page) {
  await page.getByRole("button", { name: "Send payout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Send payout", exact: true }),
  ).not.toBeVisible();
}
const snapshot = async (page: Page, id: string) =>
  (await page.request.get(`/api/v1/payouts/${id}/snapshot`)).json();

test("lost confirmation recovers one payout and one balanced journal, even after duplicate requests", async ({
  page,
}) => {
  await open(page);
  const id = await create(page);
  await send(page);
  await expect(
    page.getByText("Provider succeeded; reconciliation required.", {
      exact: true,
    }),
  ).toBeVisible();
  let state = await snapshot(page, id);
  expect(state.payout.status).toBe("UNKNOWN");
  expect(state.provider.status).toBe("SUCCEEDED");
  expect(state.ledger).toBeNull();
  await page.getByRole("button", { name: "Reconcile" }).click();
  await expect(
    page.getByText("Payout confirmed", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Ledger/ }).click();
  await expect(
    page.getByRole("cell", { name: "Balanced", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(4);
  await page.getByRole("button", { name: "Replay request" }).click();
  await expect(page.getByRole("status")).toContainText("No duplicate created.");
  await page.getByRole("button", { name: "Test conflicting request" }).click();
  await expect(page.getByRole("status")).toContainText("HTTP 409");
  state = await snapshot(page, id);
  expect(state.ledger.entries).toHaveLength(2);
  expect(state.ledger.entries.map((e: { amount: number }) => e.amount)).toEqual(
    [100, 100],
  );
  expect((await (await page.request.get("/api/v1/payouts")).json()).total).toBe(
    1,
  );
  await page.getByRole("tab", { name: "Requests" }).click();
  await expect(page.locator(".http-line")).toContainText("409");
  await page.getByRole("button", { name: /^History/ }).click();
  await expect(page.getByRole("dialog")).toContainText(id.slice(0, 8));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

for (const [scenario, expected] of [
  ["Successful payout", "SUCCEEDED"],
  ["Payment declined", "FAILED"],
] as const) {
  test(`${scenario} posts only confirmed success`, async ({ page }) => {
    await open(page);
    const id = await create(page, scenario);
    await send(page);
    await expect(
      page.getByRole("button", { name: "New payout", exact: true }),
    ).toBeVisible();
    const state = await snapshot(page, id);
    expect(state.payout.status).toBe(expected);
    expect(Boolean(state.ledger)).toBe(expected === "SUCCEEDED");
  });
}

test("a request lost before processing remains uncertain until a safe repeat succeeds", async ({
  page,
}) => {
  await open(page);
  const id = await create(page, "Request never arrives");
  await send(page);
  await page.getByRole("button", { name: "Reconcile" }).click();
  await expect(page.getByRole("status")).toContainText("Outcome still unknown");
  let state = await snapshot(page, id);
  expect(state.provider).toBeNull();
  expect(state.ledger).toBeNull();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByText("Payout confirmed", { exact: true }),
  ).toBeVisible();
  state = await snapshot(page, id);
  expect(state.payout.status).toBe("SUCCEEDED");
  expect(state.ledger.entries).toHaveLength(2);
});

for (const [scenario, final, button] of [
  ["Still processing", "SUCCEEDED", "Approve at provider"],
  ["Provider is uncertain", "FAILED", "Decline at provider"],
] as const) {
  test(`${scenario} resolves only after the app learns the provider outcome`, async ({
    page,
  }) => {
    await open(page);
    const id = await create(page, scenario);
    await send(page);
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page.getByRole("status")).toContainText(
      "Reconcile to update the payout",
    );
    expect((await snapshot(page, id)).payout.status).toBe("UNKNOWN");
    await page.getByRole("button", { name: "Reconcile" }).click();
    await expect(
      page.getByRole("button", { name: "New payout", exact: true }),
    ).toBeVisible();
    const state = await snapshot(page, id);
    expect(state.payout.status).toBe(final);
    expect(Boolean(state.ledger)).toBe(final === "SUCCEEDED");
  });
}

test("fresh workspaces cannot inspect other visitors and resetting clears the current view", async ({
  page,
  browser,
}) => {
  await open(page);
  const id = await create(page);
  const other = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const visitor = await other.newPage();
  await open(visitor);
  expect(
    (await visitor.request.get(`/api/v1/payouts/${id}/snapshot`)).status(),
  ).toBe(404);
  expect(
    (await (await visitor.request.get("/api/v1/payouts")).json()).total,
  ).toBe(0);
  await other.close();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create payout", exact: true }),
  ).toBeEnabled();
  expect(
    (await page.request.get(`/api/v1/payouts/${id}/snapshot`)).status(),
  ).toBe(404);
  expect((await (await page.request.get("/api/v1/payouts")).json()).total).toBe(
    0,
  );
});

test("currency precision is explained before submitting a payout", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Currency", { exact: true }).selectOption("JPY");
  await page.getByLabel("Payout amount").fill("0.01");
  await page
    .getByRole("button", { name: "Create payout", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "JPY supports at most 0 decimal places",
  );
  expect((await (await page.request.get("/api/v1/payouts")).json()).total).toBe(
    0,
  );
  await page.getByLabel("Currency", { exact: true }).selectOption("KWD");
  await page.getByLabel("Payout amount").fill("0.001");
  const id = await create(page, "Successful payout");
  await send(page);
  await expect(
    page.getByText("Payout confirmed", { exact: true }),
  ).toBeVisible();
  expect((await snapshot(page, id)).ledger.amount).toBe(0.001);
});

test("mobile viewport remains usable with navigation, payment controls and readable evidence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const id = await create(page);
  await send(page);
  await page.getByRole("button", { name: "Reconcile" }).click();
  await expect(
    page.getByText("Payout confirmed", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /^Ledger/ }).click();
  expect((await snapshot(page, id)).ledger.entries).toHaveLength(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "How it works", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "How it works" }),
  ).toBeVisible();
});

test("Mastercard view reports adapter availability and never exposes credentials", async ({
  page,
}) => {
  await open(page);
  const config = await (await page.request.get("/api/v1/config")).json();
  await page
    .getByRole("button", { name: "Mastercard sandbox", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mastercard sandbox" }),
  ).toBeVisible();
  const button = page.getByRole("button", {
    name: "Create payout",
    exact: true,
  });
  if (config.mastercardAvailable) await expect(button).toBeEnabled();
  else await expect(button).toBeDisabled();
  await expect(page.getByLabel("Recipient", { exact: true })).toHaveValue(
    "Jane Smith",
  );
  await expect(page.locator("input[type=password]")).toHaveCount(0);
});

test("authenticated Mastercard sandbox payout and lookup use the shared ledger", async ({
  page,
}) => {
  test.skip(
    process.env.MASTERCARD_E2E !== "true",
    "Requires privately configured Mastercard sandbox credentials",
  );
  await open(page);
  await page
    .getByRole("button", { name: "Mastercard sandbox", exact: true })
    .click();
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/payouts") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create payout", exact: true })
    .click();
  const id = (await (await created).json()).id;
  await send(page);
  await expect(page.getByText("Payout confirmed", { exact: true })).toBeVisible(
    { timeout: 20000 },
  );
  expect((await snapshot(page, id)).payout.provider).toBe("mastercard");
  await page
    .getByRole("button", { name: "Check Mastercard", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Mastercard transaction found.",
  );
  expect((await snapshot(page, id)).ledger.entries).toHaveLength(2);
});

test("an expired or missing session opens a fresh workspace without getting stuck", async ({
  page,
}) => {
  await open(page);
  await create(page);
  await page.context().clearCookies();
  await expect(
    page.getByRole("heading", { name: "Demo expired" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start new demo", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create payout", exact: true }),
  ).toBeEnabled();
  expect((await (await page.request.get("/api/v1/payouts")).json()).total).toBe(
    0,
  );
});

test("demo introduction can be dismissed, stays dismissed on reload, and can be reopened", async ({
  page,
}) => {
  await page.goto("/");
  const introduction = page.getByRole("dialog", {
    name: "Demo session",
    exact: true,
  });
  await expect(introduction).toBeVisible();
  await expect(introduction).toContainText("15 minutes");
  await expect(
    introduction.getByRole("button", { name: "Continue", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    introduction.getByRole("button", { name: "Close demo notice" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(introduction).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".connection")).toHaveText("Backend connected");
  await expect(introduction).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^Demo information/ }).click();
  await expect(introduction).toBeVisible();
  await introduction
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Demo information/ }),
  ).toBeVisible();
});

test("theme preference persists across tabs and reload without resetting the payment session", async ({
  page,
}) => {
  await open(page);
  await expect(
    page.getByRole("button", { name: "Light", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const id = await create(page);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkBackground = await page
    .locator(".panel")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page
    .getByRole("button", { name: "Mastercard sandbox", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Dark", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "How it works", exact: true }).click();
  await expect(page.locator(".panel").first()).toHaveCSS(
    "background-color",
    darkBackground,
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Dark", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await snapshot(page, id)).payout.id).toBe(id);
  expect((await (await page.request.get("/api/v1/payouts")).json()).total).toBe(
    1,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".panel").first()).not.toHaveCSS(
    "background-color",
    darkBackground,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
