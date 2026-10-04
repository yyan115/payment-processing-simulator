import { ChevronDown } from "lucide-react";
import type { Payout, Snapshot, Trace } from "../api/types";
import { money } from "../domain/money";
import { scenarios } from "../domain/scenarios";
import type { Run } from "../domain/workflow";
import { PaymentDetails } from "./PaymentDetails";

const PAGE_SIZE = 20;

export function History({
  items,
  total,
  page,
  busy,
  expanded,
  snapshots,
  traceMap,
  runFor,
  onInspect,
  onPage,
}: {
  items: Payout[];
  total: number;
  page: number;
  busy: boolean;
  expanded: string | null;
  snapshots: Record<string, Snapshot>;
  traceMap: Record<string, Trace[]>;
  runFor: (id: string) => Run | undefined;
  onInspect: (id: string) => void;
  onPage: (page: number) => void;
}) {
  return (
    <section className="history-section" aria-label="Payment history">
      <div className="section-heading">
        <h2>
          History <span>{total}</span>
        </h2>
      </div>
      {!items.length ? (
        <p className="empty-history">No payments yet.</p>
      ) : (
        items.map((payment) => {
          const run = runFor(payment.id);
          const open = expanded === payment.id;
          const scenario =
            run?.intent.provider === "simulated"
              ? scenarios.find((s) => s.id === run.scenario)?.name
              : undefined;
          return (
            <article className="payment-row" key={payment.id}>
              <button
                className="payment-summary"
                aria-expanded={open}
                onClick={() => onInspect(payment.id)}
              >
                <span>
                  <strong>{money(payment.amount, payment.currency)}</strong>
                  <small>
                    {run?.sender ? `${run.sender} → ` : "To "}
                    {payment.recipientReference}
                    {scenario ? ` · ${scenario}` : ""}
                  </small>
                </span>
                <span
                  className={`payment-status ${payment.status.toLowerCase()}`}
                >
                  {payment.status}
                </span>
                <ChevronDown size={16} className={open ? "rotated" : ""} />
              </button>
              {open && (
                <div className="payment-details">
                  <PaymentDetails
                    payment={payment}
                    snapshot={snapshots[payment.id]}
                    run={run}
                    traces={traceMap[run?.key ?? payment.id] ?? []}
                  />
                </div>
              )}
            </article>
          );
        })
      )}
      {total > PAGE_SIZE && (
        <div className="pagination">
          <button
            disabled={page === 0 || busy}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            disabled={(page + 1) * PAGE_SIZE >= total || busy}
            onClick={() => onPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
