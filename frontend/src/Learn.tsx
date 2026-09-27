import {
  Wallet,
  Send,
  CircleHelp,
  RefreshCw,
  Database,
  ChevronDown,
  ExternalLink,
  ArrowRight,
} from "lucide-react";

export default function Learn({ onStart }: { onStart: () => void }) {
  return (
    <div className="learn-page">
      <div className="page-heading">
        <h1>How it works</h1>
        <button className="button" onClick={onStart}>
          Open simulator <ArrowRight size={16} />
        </button>
      </div>
      <div className="learn-flow">
        {[
          {
            icon: <Wallet />,
            title: "Create",
            body: "Save the payout and idempotency key.",
          },
          {
            icon: <Send />,
            title: "Submit",
            body: "Send the request to the selected provider.",
          },
          {
            icon: <CircleHelp />,
            title: "Update",
            body: "Record success, failure, or an unknown outcome.",
          },
          {
            icon: <RefreshCw />,
            title: "Reconcile",
            body: "Resolve uncertainty with a provider lookup.",
          },
          {
            icon: <Database />,
            title: "Post",
            body: "Commit confirmed success and ledger entries together.",
          },
        ].map((step, i) => (
          <div key={step.title}>
            <span className="learn-step">0{i + 1}</span>
            {step.icon}
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
        ))}
      </div>
      <div className="learn-columns">
        <section className="panel">
          <h2>Payment handling</h2>
          <details>
            <summary>
              Idempotency <ChevronDown size={16} />
            </summary>
            <p>
              Repeating a creation request with the same key and details returns
              the original payout. Changing the details returns HTTP 409.
            </p>
          </details>
          <details>
            <summary>
              Unknown outcomes <ChevronDown size={16} />
            </summary>
            <p>
              A timeout leaves the payout UNKNOWN. A confirmed failure sets it
              to FAILED. Neither posts a success journal.
            </p>
          </details>
          <details>
            <summary>
              Reconciliation and retries <ChevronDown size={16} />
            </summary>
            <p>
              Reconcile looks up the existing payment. Retry resubmits with the
              same provider reference. A missing provider record leaves the
              outcome unknown.
            </p>
          </details>
        </section>
        <section className="panel learn-ledger">
          <h2>Ledger example · SGD 100</h2>
          <div className="example-entry">
            <span>Seller payable</span>
            <strong>Debit 100</strong>
          </div>
          <div className="example-entry">
            <span>Cash clearing</span>
            <strong>Credit 100</strong>
          </div>
          <p>
            Confirmed success reduces the seller payable and records the
            outgoing payout in one transaction.
          </p>
          <small>
            Fees, foreign exchange, bank settlement, and reversals are outside
            this model.
          </small>
        </section>
      </div>
      <section className="panel providers-panel">
        <h2>Providers</h2>
        <p>Both adapters use the same payout state machine and ledger.</p>
        <dl className="provider-list">
          <div>
            <dt>Simulator</dt>
            <dd>Controlled outcomes, timeouts, and delayed responses.</dd>
          </div>
          <div>
            <dt>Mastercard Send</dt>
            <dd>
              Authenticated requests to Mastercard’s sandbox, which returns
              simulated payment responses.
            </dd>
          </div>
        </dl>
        <a
          href="https://developer.mastercard.com/mastercard-send-disbursements/documentation/"
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          Mastercard documentation <ExternalLink size={14} />
        </a>
      </section>
    </div>
  );
}
