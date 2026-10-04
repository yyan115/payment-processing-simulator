import { test, expect } from "@playwright/test";
import { instantSteps, open } from "./helpers";

test.beforeEach(instantSteps);

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
  await expect(page.getByLabel("Amount")).toHaveValue("50.00");
  await expect(
    page.getByText(
      /official Mastercard API sandbox using the Mastercard Send API, within Mastercard’s test environment/,
    ),
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

test("authenticated Visa Direct payout and lookup", async ({ page }) => {
  test.skip(process.env.VISA_E2E !== "true");
  await open(page);
  await page.getByRole("button", { name: "Step by step" }).click();
  await page
    .getByLabel("Payment network", { exact: true })
    .selectOption("visa");
  await expect(page.getByRole("group", { name: "Playback" })).toHaveCount(0);
  await expect(page.getByLabel("Amount")).toHaveValue("50.00");
  await expect(
    page.getByText(
      /official Visa API sandbox using the Visa Direct API, within Visa’s test environment/,
    ),
  ).toBeVisible();
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
