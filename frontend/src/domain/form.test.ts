import { describe, expect, it } from "vitest";
import { currencyFor, initialForm, withMode, withSender } from "./form";
import { participants } from "./scenarios";

describe("payment form", () => {
  it("never leaves the sender as the recipient", () => {
    for (const sender of participants) {
      const form = withSender(initialForm, sender);
      expect(form.recipient).not.toBe(sender);
    }
  });
  it("keeps the recipient when the sender changes to someone else", () => {
    const form = withSender(
      { ...initialForm, recipient: participants[2] },
      participants[1],
    );
    expect(form.recipient).toBe(participants[2]);
  });
  it("uses 100.00 SGD on the simulated network and 50.00 USD on the sandboxes", () => {
    expect(withMode(initialForm, "visa").amount).toBe("50.00");
    expect(withMode(initialForm, "mastercard").amount).toBe("50.00");
    expect(withMode(withMode(initialForm, "visa"), "simulated").amount).toBe(
      "100.00",
    );
    expect(currencyFor("simulated")).toBe("SGD");
    expect(currencyFor("visa")).toBe("USD");
  });
});
