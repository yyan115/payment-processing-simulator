import { expect, type Page } from "@playwright/test";

export const names: Record<string, string> = {
  SUCCESS: "Approved payment",
  DECLINED: "Declined payment",
  TIMEOUT_AFTER_SUCCESS: "Response lost",
  TIMEOUT_BEFORE_PROCESSING: "Request lost",
  PENDING: "Pending payment",
  UNKNOWN: "Unknown outcome",
};

export const choose = (page: Page, scenario: string) =>
  page.getByRole("radio", { name: names[scenario], exact: true }).check();

// Steps are paced for viewers. Tests skip the wait unless they test the pacing.
export async function instantSteps({ page }: { page: Page }) {
  await page.addInitScript(() =>
    localStorage.setItem("payment-simulator-pace", "0"),
  );
}

export async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator(".connection")).toHaveText("Connected");
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
}

// Chooses a scenario, sends, and returns the created payout once the run is over.
export async function send(page: Page, scenario = "TIMEOUT_AFTER_SUCCESS") {
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
