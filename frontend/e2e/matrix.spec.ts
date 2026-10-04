import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Exhaustive pass over every scenario, sender, recipient and playback mode on the simulated network,
// plus every sender and recipient on each live sandbox. Screenshots are kept for visual review.
const people = ["Sarah Lim", "Daniel Wong", "Rachel Koh"];
const scenarios = [
  {
    id: "SUCCESS",
    name: "Approved payment",
    status: "SUCCEEDED",
    posted: true,
    ok: true,
  },
  {
    id: "DECLINED",
    name: "Declined payment",
    status: "FAILED",
    posted: false,
    ok: true,
  },
  {
    id: "TIMEOUT_AFTER_SUCCESS",
    name: "Response lost",
    status: "SUCCEEDED",
    posted: true,
    ok: false,
  },
  {
    id: "TIMEOUT_BEFORE_PROCESSING",
    name: "Request lost",
    status: "SUCCEEDED",
    posted: true,
    ok: false,
  },
  {
    id: "PENDING",
    name: "Pending payment",
    status: "SUCCEEDED",
    posted: true,
    ok: true,
  },
  {
    id: "UNKNOWN",
    name: "Unknown outcome",
    status: "UNKNOWN",
    posted: false,
    ok: true,
  },
];
const shots = process.env.MATRIX_SHOTS ?? "test-results/matrix-shots";
mkdirSync(shots, { recursive: true });
const tag = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-");

function watch(page: Page, allowServerErrors: boolean) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
      problems.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) {
      // The admission limit answers 429 when workspaces open very quickly, and the page retries by itself.
      const admission =
        r.status() === 429 && r.url().includes("/api/v1/workspace");
      const expected =
        admission ||
        (allowServerErrors && [502, 503, 504].includes(r.status()));
      if (!expected)
        problems.push(`http ${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });
  return problems;
}

async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator(".connection")).toHaveText("Connected");
  await expect(
    page.getByRole("button", { name: "Send payment", exact: true }),
  ).toBeEnabled();
}

// Everything visible must fit: no sideways scroll, no clipped text, no unfilled placeholders.
async function layoutProblems(page: Page, where: string) {
  const found = await page.evaluate(() => {
    const out: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > window.innerWidth + 1)
      out.push(
        `page scrolls sideways (${root.scrollWidth} > ${window.innerWidth})`,
      );
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>("body *"),
    )) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (el.closest("[role=tooltip]")) continue;
      const clips =
        style.overflowX === "hidden" || style.textOverflow === "ellipsis";
      if (
        clips &&
        el.scrollWidth > el.clientWidth + 1 &&
        el.textContent?.trim()
      )
        out.push(
          `clipped text in <${el.tagName.toLowerCase()} class="${el.className}">: ${el.textContent.trim().slice(0, 60)}`,
        );
      if (box.right > window.innerWidth + 1 && !el.closest("pre, code, table"))
        out.push(
          `overflows the screen: <${el.tagName.toLowerCase()} class="${el.className}">`,
        );
    }
    const text = document.body.innerText;
    for (const bad of ["undefined", "NaN", "[object", "null", "{{"])
      if (text.includes(bad)) out.push(`placeholder text "${bad}" is visible`);
    return out;
  });
  return found.map((f) => `${where}: ${f}`);
}

async function explanationProblems(
  page: Page,
  from: string,
  to: string,
  lineLimit: number,
) {
  const out: string[] = [];
  const text = page.locator(".scenario-explanation");
  const body = ((await text.textContent()) ?? "").replace(/\u00a0/g, " ");
  if (!body.includes(from))
    out.push(`explanation does not name the sender ${from}`);
  if (!body.includes(to))
    out.push(`explanation does not name the recipient ${to}`);
  if (!body.includes("SGD 100.00"))
    out.push("explanation does not show SGD 100.00");
  const lines = await text
    .locator("p")
    .evaluateAll((ps) =>
      ps.map((p) =>
        Math.round(
          p.getBoundingClientRect().height /
            parseFloat(getComputedStyle(p).lineHeight),
        ),
      ),
    );
  for (const count of lines)
    if (count > lineLimit)
      out.push(`an explanation paragraph runs ${count} lines`);
  return out;
}

async function finish(page: Page, mode: "auto" | "step") {
  const items = page.locator(".timeline li");
  const final = page.locator(".timeline li.final");
  const next = page.getByRole("button", { name: "Next step" });
  const problems: string[] = [];
  if (mode === "step") {
    await expect(items.first()).toBeVisible();
    let shown = await items.count();
    for (let guard = 0; guard < 30; guard++) {
      if ((await final.count()) > 0) break;
      await expect(next).toBeVisible();
      await page.waitForTimeout(250);
      if ((await items.count()) !== shown)
        problems.push("a step appeared without pressing Next step");
      await next.click();
      await expect.poll(() => items.count()).toBeGreaterThan(shown);
      shown = await items.count();
    }
    await expect(next).toHaveCount(0);
  }
  await expect(final).toHaveCount(1, { timeout: 30000 });
  const texts = await items.allTextContents();
  texts.forEach((t, i) => {
    if (!t.trim()) problems.push(`step ${i + 1} is empty`);
  });
  return { problems, steps: texts.length };
}

async function verifyOutcome(
  page: Page,
  s: (typeof scenarios)[number],
  from: string,
  to: string,
  amountText: string,
) {
  const problems: string[] = [];
  const row = page.locator(".payment-row");
  await expect(row).toHaveCount(1);
  await expect(row.locator(".payment-status")).toHaveText(s.status);
  await expect(page.locator("li.final")).toContainText(`Result: ${s.status}`);
  const summary = (
    (await row.locator(".payment-summary").textContent()) ?? ""
  ).replace(/\u00a0/g, " ");
  for (const needle of [from, to, amountText, s.name, s.status])
    if (!summary.includes(needle))
      problems.push(`history row is missing "${needle}"`);
  await row.locator(".payment-summary").click();
  const details = row.locator(".payment-details");
  await expect(details).toBeVisible();
  const detailText = (await details.textContent()) ?? "";
  for (const needle of [
    to,
    "Idempotency key",
    "Payment ID",
    "Payment created",
    s.name,
  ])
    if (!detailText.includes(needle))
      problems.push(`history details are missing "${needle}"`);
  const journal = row.getByText(/^Journal entry ·/);
  await expect(journal).toHaveText(s.posted ? /· posted$/ : /· not posted$/);
  await journal.click();
  await expect(row.locator(".journal-lines li")).toHaveCount(s.posted ? 2 : 0);
  const ledger = page.getByRole("region", { name: "Ledger" });
  if (s.posted) {
    await expect(ledger.locator(".postings tbody tr")).toHaveCount(2);
    await expect(
      ledger.locator(".account-card").filter({ hasText: `Payable to ${to}` }),
    ).toContainText("SGD 100.00 debit");
    await expect(
      ledger.locator(".account-card").filter({ hasText: "Cash clearing" }),
    ).toContainText("SGD 100.00 credit");
    await expect(ledger.locator(".postings tbody tr").first()).toContainText(
      `${from} → ${to}`,
    );
  } else {
    await expect(ledger).toContainText("No entries yet.");
  }
  return problems;
}

for (const viewport of [
  { label: "desktop", size: { width: 1440, height: 1000 }, lines: 4 },
  { label: "phone", size: { width: 390, height: 844 }, lines: 9 },
]) {
  test.describe(`simulated network on ${viewport.label}`, () => {
    test.use({ viewport: viewport.size });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() =>
        localStorage.setItem("payment-simulator-pace", "0"),
      );
    });
    for (const s of scenarios)
      for (const from of people)
        for (const to of people.filter((p) => p !== from))
          for (const mode of ["auto", "step"] as const) {
            test(`${s.name} | ${from} to ${to} | ${mode}`, async ({
              page,
            }, info) => {
              info.setTimeout(120000);
              const problems = watch(page, !s.ok);
              await open(page);
              await page.getByLabel("From", { exact: true }).selectOption(from);
              await page.getByLabel("To", { exact: true }).selectOption(to);
              await expect(page.getByLabel("To", { exact: true })).toHaveValue(
                to,
              );
              await page
                .getByRole("button", {
                  name: mode === "auto" ? "Automatic" : "Step by step",
                })
                .click();
              await page
                .getByRole("radio", { name: s.name, exact: true })
                .check();
              problems.push(
                ...(await explanationProblems(page, from, to, viewport.lines)),
              );
              problems.push(...(await layoutProblems(page, "before sending")));
              await page
                .getByRole("button", { name: "Send payment", exact: true })
                .click();
              const run = await finish(page, mode);
              problems.push(...run.problems);
              await expect(
                page.getByRole("button", { name: "Send payment", exact: true }),
              ).toBeEnabled();
              problems.push(
                ...(await verifyOutcome(page, s, from, to, "SGD 100.00")),
              );
              problems.push(...(await layoutProblems(page, "after the run")));
              const name = tag(
                `${viewport.label}-${s.id}-${from}-${to}-${mode}`,
              );
              if ((from === people[0] && to === people[1]) || problems.length)
                await page.evaluate(() => window.scrollTo(0, 0));
              await page.screenshot({
                path: `${shots}/${name}.png`,
                fullPage: true,
              });
              expect(problems, problems.join("\n")).toEqual([]);
            });
          }
  });
}

// The real animation speed: steps must arrive one at a time, not all at once and not too slowly.
for (const viewport of [
  { label: "desktop", size: { width: 1440, height: 1000 } },
  { label: "phone", size: { width: 390, height: 844 } },
]) {
  test.describe(`real animation pace on ${viewport.label}`, () => {
    test.use({ viewport: viewport.size });
    for (const s of scenarios)
      test(`${s.name} reveals its steps gradually`, async ({ page }, info) => {
        info.setTimeout(150000);
        const problems = watch(page, !s.ok);
        await open(page);
        await page.getByRole("radio", { name: s.name, exact: true }).check();
        await page
          .getByRole("button", { name: "Send payment", exact: true })
          .click();
        const items = page.locator(".timeline li");
        const seen: { at: number; count: number }[] = [];
        const started = Date.now();
        let last = -1;
        while (Date.now() - started < 90000) {
          const count = await items.count();
          if (count !== last) {
            seen.push({ at: Date.now() - started, count });
            last = count;
          }
          if ((await page.locator(".timeline li.final").count()) > 0) break;
          await page.waitForTimeout(100);
        }
        const total = Date.now() - started;
        if (seen.length < 3)
          problems.push(
            `steps did not arrive gradually: ${JSON.stringify(seen)}`,
          );
        if (seen.some((point, i) => i > 0 && point.count < seen[i - 1].count))
          problems.push("the step list shrank during the run");
        if (total < 3000)
          problems.push(
            `the whole run took only ${total} ms, too fast to follow`,
          );
        if (total > 45000) problems.push(`the run took ${total} ms, too slow`);
        info.annotations.push({
          type: "timing",
          description: `${total} ms over ${seen.length} updates`,
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `${shots}/pace-${viewport.label}-${s.id}.png`,
          fullPage: true,
        });
        expect(problems, problems.join("\n")).toEqual([]);
      });
  });
}

// Dark theme and the help tooltip, once per scenario, for contrast and layout review.
test.describe("dark theme", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("payment-simulator-pace", "0"),
    );
  });
  for (const s of scenarios)
    test(`${s.name} in the dark theme`, async ({ page }) => {
      const problems = watch(page, !s.ok);
      await open(page);
      await page.getByRole("button", { name: /Switch to dark theme/ }).click();
      await page.getByRole("radio", { name: s.name, exact: true }).check();
      await page
        .getByRole("button", { name: "Send payment", exact: true })
        .click();
      await finish(page, "auto");
      problems.push(...(await layoutProblems(page, "dark theme")));
      await page.locator(".playback .hint").hover();
      await expect(page.getByRole("tooltip")).toBeVisible();
      await page.waitForTimeout(400);
      expect(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).colorScheme,
        ),
      ).toBe("dark");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${shots}/dark-${s.id}.png`,
        fullPage: true,
      });
      expect(problems, problems.join("\n")).toEqual([]);
    });
});

// Both live sandboxes, every sender and recipient, on both screen sizes.
const live = [
  {
    key: "mastercard",
    flag: "MASTERCARD_E2E",
    name: "Mastercard API sandbox",
    api: "Mastercard Send API",
  },
  {
    key: "visa",
    flag: "VISA_E2E",
    name: "Visa API sandbox",
    api: "Visa Direct API",
  },
];
for (const network of live)
  for (const viewport of [
    { label: "desktop", size: { width: 1440, height: 1000 } },
    { label: "phone", size: { width: 390, height: 844 } },
  ])
    test.describe(`${network.name} on ${viewport.label}`, () => {
      test.use({ viewport: viewport.size });
      test.skip(process.env[network.flag] !== "true");
      // The sandboxes answer 429 to bursts, so live runs are spaced out.
      test.beforeEach(async () => {
        await new Promise((resolve) =>
          setTimeout(resolve, Number(process.env.LIVE_GAP_MS ?? 20000)),
        );
      });
      for (const from of people)
        for (const to of people.filter((p) => p !== from))
          test(`${from} to ${to}`, async ({ page }, info) => {
            info.setTimeout(120000);
            const problems = watch(page, false);
            await open(page);
            await page.getByLabel("From", { exact: true }).selectOption(from);
            await page.getByLabel("To", { exact: true }).selectOption(to);
            await page
              .getByLabel("Payment network", { exact: true })
              .selectOption(network.key);
            await expect(page.getByLabel("Amount")).toHaveValue("50.00");
            await expect(
              page.getByRole("group", { name: "Playback" }),
            ).toHaveCount(0);
            await expect(page.getByRole("radio")).toHaveCount(0);
            const note = page.locator(".field-note");
            await expect(note).toContainText(
              `official ${network.name} using the ${network.api}`,
            );
            problems.push(...(await layoutProblems(page, "before sending")));
            await page
              .getByRole("button", { name: "Send payment", exact: true })
              .click();
            await expect(
              page.getByRole("button", { name: "Send payment", exact: true }),
            ).toBeEnabled({ timeout: 40000 });
            const row = page.locator(".payment-row");
            await expect(row).toHaveCount(1);
            await expect(row.locator(".payment-status")).toHaveText(
              "SUCCEEDED",
            );
            await expect(page.locator(".flow")).toContainText(network.name);
            const summary = (
              (await row.locator(".payment-summary").textContent()) ?? ""
            ).replace(/\u00a0/g, " ");
            for (const needle of [from, to, "USD 50.00"])
              if (!summary.includes(needle))
                problems.push(`history row is missing "${needle}"`);
            await row.locator(".payment-summary").click();
            const detail =
              (await row.locator(".payment-details").textContent()) ?? "";
            for (const needle of [
              to,
              network.name,
              "Idempotency key",
              "Payment ID",
            ])
              if (!detail.includes(needle))
                problems.push(`history details are missing "${needle}"`);
            await row.getByText(/^Journal entry ·/).click();
            await expect(row.locator(".journal-lines li")).toHaveCount(2);
            const ledger = page.getByRole("region", { name: "Ledger" });
            await expect(
              ledger
                .locator(".account-card")
                .filter({ hasText: `Payable to ${to}` }),
            ).toContainText("USD 50.00 debit");
            problems.push(...(await layoutProblems(page, "after the run")));
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({
              path: `${shots}/${network.key}-${viewport.label}-${tag(from)}-${tag(to)}.png`,
              fullPage: true,
            });
            expect(problems, problems.join("\n")).toEqual([]);
          });
    });
