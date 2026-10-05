import { test, expect } from "@playwright/test";
import { instantSteps, open, send } from "./helpers";

test.beforeEach(instantSteps);

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
  // The newest posting is listed first, so the credit sits above the debit.
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

test("each check with the network is listed once in the payment's events", async ({
  page,
}) => {
  await open(page);
  await send(page, "TIMEOUT_AFTER_SUCCESS");
  const row = page.locator(".payment-row");
  await row.locator(".payment-summary").click();
  const events = row.locator(".payment-details ol li");
  await expect(
    events.filter({
      hasText: "Checked with the network: the payment was made",
    }),
  ).toHaveCount(1);
  await expect(events).toHaveCount(4);
});

test("a payment's events and checks are listed in the order they happened", async ({
  page,
}) => {
  await open(page);
  await send(page, "TIMEOUT_BEFORE_PROCESSING");
  const row = page.locator(".payment-row");
  await row.locator(".payment-summary").click();
  const texts = await row
    .locator(".payment-details ol.events li span")
    .allTextContents();
  const index = (needle: string) => texts.findIndex((t) => t.includes(needle));
  expect(index("Payment created")).toBe(0);
  expect(index("Checked with the network: it has no record")).toBeGreaterThan(
    index("No response from the network"),
  );
  expect(index("Payment sent again")).toBeGreaterThan(
    index("Checked with the network: it has no record"),
  );
});

test.describe("ledger on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("every ledger column is visible without sideways scrolling", async ({
    page,
  }) => {
    await open(page);
    await send(page, "SUCCESS");
    const ledger = page.getByRole("region", { name: "Ledger" });
    const rows = ledger.locator(".postings tbody tr");
    await expect(rows).toHaveCount(2);
    for (const label of ["Time", "Payment", "Account", "Credit", "Balance"])
      await expect(
        rows.first().locator(`td[data-label="${label}"]`),
      ).toBeVisible();
    await expect(rows.last().locator('td[data-label="Debit"]')).toBeVisible();
    const scrolls = await ledger
      .locator(".table-scroll")
      .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(scrolls).toBe(false);
  });
});
