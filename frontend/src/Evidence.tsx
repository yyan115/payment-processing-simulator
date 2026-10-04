import { money } from "./model";
import type { LedgerAccount, LedgerPosting, Snapshot } from "./model";
import { shortId, time } from "./presentation";
// The backend stores one payable account per recipient, plus a shared clearing account.
export const accountName = (code: string) =>
  code.startsWith("SELLER_PAYABLE:")
    ? `Payable to ${code.slice("SELLER_PAYABLE:".length)}`
    : code === "CASH_CLEARING"
      ? "Cash clearing"
      : code;
// What one payment posted, as plain lines. The ledger section shows the same postings in the book.
export function JournalEntry({ snapshot }: { snapshot: Snapshot | null }) {
  const ledger = snapshot?.ledger;
  if (!ledger)
    return <p className="field-note">Nothing was posted for this payment.</p>;
  return (
    <>
      <ul className="journal-lines">
        {ledger.entries.map((entry) => (
          <li key={entry.id}>
            <span className="side">
              {entry.direction === "DEBIT" ? "Debit" : "Credit"}
            </span>
            <span>{accountName(entry.accountCode)}</span>
            <strong>{money(entry.amount, entry.currency)}</strong>
          </li>
        ))}
      </ul>
      <p className="field-note">
        Entry <code>{shortId(ledger.id)}</code>
      </p>
    </>
  );
}
// Round to four decimal places, the precision the backend stores.
const round = (value: number) => Math.round(value * 1e4) / 1e4;
export function signed(net: number, currency: string) {
  const value = round(net);
  if (value === 0) return money(0, currency);
  return `${money(Math.abs(value), currency)} ${value > 0 ? "debit" : "credit"}`;
}
export const balanceText = (account: LedgerAccount) =>
  signed(Number(account.debits) - Number(account.credits), account.currency);
type Line = LedgerPosting & { balance: string };
// Oldest first, each line carrying its account's balance after that posting.
export function withRunningBalances(postings: LedgerPosting[]): Line[] {
  const totals = new Map<string, number>();
  return postings.map((posting) => {
    const key = `${posting.accountCode}|${posting.currency}`;
    const next =
      (totals.get(key) ?? 0) +
      (posting.direction === "DEBIT" ? 1 : -1) * Number(posting.amount);
    totals.set(key, next);
    return { ...posting, balance: signed(next, posting.currency) };
  });
}
// The accounting book: each account's balance, then every posting, newest first.
export function Ledger({
  accounts,
  postings,
  paymentLabel,
}: {
  accounts: LedgerAccount[];
  postings: LedgerPosting[];
  paymentLabel: (payoutId: string) => string;
}) {
  if (!accounts.length) return <p className="empty-history">No entries yet.</p>;
  const lines = withRunningBalances(postings).reverse();
  return (
    <>
      <div className="account-cards">
        {accounts.map((a) => (
          <div className="account-card" key={`${a.accountCode}-${a.currency}`}>
            <span>{accountName(a.accountCode)}</span>
            <strong>{balanceText(a)}</strong>
          </div>
        ))}
      </div>
      <div className="table-scroll">
        <table className="ledger-table postings">
          <thead>
            <tr>
              <th>Time</th>
              <th>Payment</th>
              <th>Account</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td data-label="Time">{time(line.createdAt)}</td>
                <td data-label="Payment">{paymentLabel(line.payoutId)}</td>
                <td data-label="Account">{accountName(line.accountCode)}</td>
                <td data-label="Debit">
                  {line.direction === "DEBIT"
                    ? money(line.amount, line.currency)
                    : ""}
                </td>
                <td data-label="Credit">
                  {line.direction === "CREDIT"
                    ? money(line.amount, line.currency)
                    : ""}
                </td>
                <td data-label="Balance">{line.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
