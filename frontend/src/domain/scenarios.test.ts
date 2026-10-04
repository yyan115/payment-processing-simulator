import { describe, expect, it } from "vitest";
import {
  participants,
  recipientAfterSenderChange,
  recipientsFor,
  scenarios,
} from "./scenarios";
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
    const party = {
      from: "Sarah Lim",
      to: "Daniel Wong",
      amount: "SGD 100.00",
    };
    expect(new Set(scenarios.map((s) => s.name)).size).toBe(6);
    for (const s of scenarios) {
      expect(s.summary.endsWith(".")).toBe(true);
      const paragraphs = s.explanation(party);
      const text = paragraphs.join(" ");
      expect(paragraphs.length).toBeGreaterThanOrEqual(2);
      expect(paragraphs.length).toBeLessThanOrEqual(3);
      for (const paragraph of paragraphs)
        expect(paragraph.length).toBeLessThanOrEqual(200);
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
