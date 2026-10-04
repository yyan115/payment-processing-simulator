import type { LedgerAccount, LedgerPosting } from "../api/types";
import { Ledger } from "./Ledger";

export function LedgerSection({
  accounts,
  postings,
  paymentLabel,
}: {
  accounts: LedgerAccount[];
  postings: LedgerPosting[];
  paymentLabel: (id: string) => string;
}) {
  return (
    <section className="ledger-section" aria-label="Ledger">
      <div className="section-heading">
        <h2>Ledger</h2>
      </div>
      <p className="section-note">
        Every journal entry is posted here as a debit and a credit.
      </p>
      <Ledger
        accounts={accounts}
        postings={postings}
        paymentLabel={paymentLabel}
      />
    </section>
  );
}
