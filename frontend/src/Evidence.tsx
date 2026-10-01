import { CheckCircle2, ShieldCheck } from "lucide-react";
import { money } from "./model";
import type { Snapshot } from "./model";
import { shortId } from "./presentation";
export function LedgerView({ snapshot }: { snapshot: Snapshot | null }) {
  const ledger = snapshot?.ledger;
  if (!ledger)
    return (
      <div className="empty-evidence">
        <span className="empty-icon">
          <ShieldCheck size={23} />
        </span>
        <div>
          <strong>No ledger entries</strong>
        </div>
      </div>
    );
  return (
    <>
      <div className="journal-title">
        <span>
          <CheckCircle2 size={16} />
          Payout journal
        </span>
        <code>{shortId(ledger.id)}</code>
      </div>
      <div className="table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            {ledger.entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <strong>
                    {entry.accountCode.startsWith("SELLER_PAYABLE:")
                      ? "Seller payable"
                      : "Cash clearing"}
                  </strong>
                </td>
                <td>
                  {entry.direction === "DEBIT"
                    ? money(entry.amount, entry.currency)
                    : "—"}
                </td>
                <td>
                  {entry.direction === "CREDIT"
                    ? money(entry.amount, entry.currency)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>
                <CheckCircle2 size={14} /> Balanced
              </td>
              <td>{money(ledger.amount, ledger.currency)}</td>
              <td>{money(ledger.amount, ledger.currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
