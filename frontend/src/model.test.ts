import { describe, expect, it } from "vitest";
import {
  minorUnits,
  normalizeIntent,
  participants,
  recipientAfterSenderChange,
  recipientsFor,
  scenarios,
} from "./model";
describe("money at the API boundary", () => {
  it.each([
    ["0.01", "USD", 1n],
    ["1", "JPY", 1n],
    ["0.001", "KWD", 1n],
    ["10.0100", "SGD", 1001n],
    ["1000000", "USD", 100000000n],
  ])("converts %s %s exactly", (value, currency, units) =>
    expect(minorUnits(value, currency)).toBe(units),
  );
  it.each([
    ["0", "USD"],
    ["-1", "USD"],
    ["1.1", "JPY"],
    ["0.0001", "KWD"],
    ["1e2", "USD"],
    ["Infinity", "USD"],
    ["1000001", "USD"],
    ["1", "ABC"],
  ])("rejects %s %s before submission", (value, currency) =>
    expect(() => minorUnits(value, currency)).toThrow(),
  );
  it("normalizes equivalent input without dropping its provider", () =>
    expect(
      normalizeIntent({
        recipientReference: " Jane ",
        amount: "0053.0",
        currency: "usd",
        provider: "mastercard",
      }),
    ).toEqual({
      recipientReference: "Jane",
      amount: "53.00",
      currency: "USD",
      provider: "mastercard",
    }));
});

describe("participants", () => {
  it("never offers the sender as a recipient", () => {
    for (const sender of participants)
      expect(recipientsFor(sender)).not.toContain(sender);
  });
  it("moves the recipient when the sender becomes the same person", () => {
    for (const sender of participants)
      for (const recipient of participants) {
        const next = recipientAfterSenderChange(sender, recipient);
        expect(next).not.toBe(sender);
        expect(recipientsFor(sender)).toContain(next);
        if (recipient !== sender) expect(next).toBe(recipient);
      }
  });
});
describe("scenario descriptions", () => {
  it("name the people and amount and use the real payment terms", () => {
    const party = { from: "Sarah Lim", to: "Daniel Wong", amount: "SGD 100.00" };
    expect(new Set(scenarios.map((s) => s.name)).size).toBe(6);
    for (const s of scenarios) {
      expect(s.summary.endsWith(".")).toBe(true);
      const paragraphs = s.explanation(party);
      const text = paragraphs.join(" ");
      expect(paragraphs).toHaveLength(2);
      expect(text).toContain("Sarah Lim sends Daniel Wong SGD 100.00");
      expect(text).toMatch(/SUCCEEDED|FAILED|UNKNOWN/);
    }
    const lost = scenarios.find((s) => s.id === "TIMEOUT_AFTER_SUCCESS");
    expect(lost?.explanation(party).join(" ")).toContain("reconciles");
    for (const s of scenarios) {
      expect(s.explanation(party).join(" ")).not.toMatch(/Mastercard|Visa/);
    }
  });
});
