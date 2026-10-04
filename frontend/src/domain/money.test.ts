import { describe, expect, it } from "vitest";
import { minorUnits, normalizeIntent } from "./money";
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
