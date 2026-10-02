import { describe, expect, it } from "vitest";
import { accountName, balanceText, withRunningBalances } from "./Evidence";
// Intl puts a no-break space between the currency code and the number.
const text = (value: string) => value.replaceAll(" ", " ");
const account = (debits: number, credits: number) => ({
  accountCode: "CASH_CLEARING",
  currency: "SGD",
  debits,
  credits,
  entries: 1,
});
const posting = (
  id: string,
  accountCode: string,
  direction: "DEBIT" | "CREDIT",
  amount: number,
) => ({
  id,
  payoutId: "p",
  accountCode,
  direction,
  amount,
  currency: "SGD",
  createdAt: "2026-10-02T00:00:00Z",
});
describe("ledger display", () => {
  it("names the accounts the way an accountant would read them", () => {
    expect(accountName("SELLER_PAYABLE:John Lim")).toBe("Payable to John Lim");
    expect(accountName("CASH_CLEARING")).toBe("Cash clearing");
    expect(accountName("OTHER")).toBe("OTHER");
  });
  it("shows the balance as debit or credit", () => {
    expect(text(balanceText(account(100, 0)))).toBe("SGD 100.00 debit");
    expect(text(balanceText(account(0, 100)))).toBe("SGD 100.00 credit");
    expect(text(balanceText(account(100, 100)))).toBe("SGD 0.00");
    expect(text(balanceText(account(100.1, 0.1)))).toBe("SGD 100.00 debit");
  });
  it("carries a running balance per account through the postings", () => {
    const lines = withRunningBalances([
      posting("1", "SELLER_PAYABLE:John Lim", "DEBIT", 100),
      posting("2", "CASH_CLEARING", "CREDIT", 100),
      posting("3", "SELLER_PAYABLE:John Lim", "DEBIT", 50),
      posting("4", "CASH_CLEARING", "CREDIT", 50),
    ]);
    expect(lines.map((l) => text(l.balance))).toEqual([
      "SGD 100.00 debit",
      "SGD 100.00 credit",
      "SGD 150.00 debit",
      "SGD 150.00 credit",
    ]);
  });
});
