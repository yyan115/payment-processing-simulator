import { test, expect } from "@playwright/test";
import { choose, instantSteps, open, send } from "./helpers";

test.beforeEach(instantSteps);

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

test("the dark theme also darkens the built-in controls", async ({ page }) => {
  await open(page);
  const scheme = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  expect(await scheme()).toBe("light");
  await page.getByRole("button", { name: /Switch to dark theme/ }).click();
  expect(await scheme()).toBe("dark");
});
