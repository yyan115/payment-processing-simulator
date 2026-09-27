import {
  History,
  ShieldCheck,
  CheckCircle2,
  Code2,
  Fingerprint,
  Copy,
  ChevronDown,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { money } from "./model";
import type { Snapshot, Trace } from "./model";
import { eventText, labels, shortId, statusClass, time } from "./presentation";
export function Timeline({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot)
    return (
      <div className="empty-evidence">
        <span className="empty-icon">
          <History size={22} />
        </span>
        <div>
          <strong>No events yet</strong>
        </div>
      </div>
    );
  return (
    <div className="timeline">
      <div className="timeline-event">
        <span className="timeline-dot created" />
        <div>
          <strong>Payout created</strong>
        </div>
        <time>{time(snapshot.payout.createdAt)}</time>
      </div>
      {snapshot.events.map((event) => (
        <div
          key={event.id}
          className={`timeline-event ${statusClass(event.toStatus)}`}
        >
          <span className="timeline-dot" />
          <div>
            <strong>
              {eventText[event.eventType] ??
                event.eventType.toLowerCase().replaceAll("_", " ")}
            </strong>
            <span className="transition">
              {event.fromStatus}
              <ArrowRight size={11} />
              {event.toStatus}
            </span>
          </div>
          <time>{time(event.createdAt)}</time>
        </div>
      ))}
      {snapshot.attempts.length > 0 && (
        <div className="reconciliation-history">
          <span className="tiny-eyebrow">PROVIDER LOOKUPS</span>
          {snapshot.attempts.map((attempt) => (
            <div key={attempt.id}>
              <RefreshCw size={13} />
              <span>
                {attempt.providerRecordFound
                  ? `Provider: ${labels[attempt.providerStatus ?? "UNKNOWN"]}`
                  : "No matching record"}
              </span>
              <time>{time(attempt.createdAt)}</time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
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
export function RequestView({
  trace,
  requestKey,
}: {
  trace?: Trace;
  requestKey: string;
}) {
  return (
    <div className="request-view">
      <div className="key-row">
        <Fingerprint size={16} />
        <span>Idempotency key</span>
        <code>{trace?.idempotencyKey ?? requestKey}</code>
        <button
          className="icon-button"
          aria-label="Copy idempotency key"
          onClick={() =>
            void navigator.clipboard?.writeText(
              trace?.idempotencyKey ?? requestKey,
            )
          }
        >
          <Copy size={14} />
        </button>
      </div>
      {trace ? (
        <>
          <div className="http-line">
            <strong>{trace.method}</strong>
            <code>{trace.path}</code>
            <span
              className={trace.status < 400 ? "http-success" : "http-error"}
            >
              {trace.status}
            </span>
            <small>{trace.duration} ms</small>
          </div>
          {trace.request !== null && (
            <details>
              <summary>
                Request body
                <ChevronDown size={14} />
              </summary>
              <pre>{JSON.stringify(trace.request, null, 2)}</pre>
            </details>
          )}
          <details open>
            <summary>
              Response
              <ChevronDown size={14} />
            </summary>
            <pre>
              {trace.response === null
                ? "No response body."
                : JSON.stringify(trace.response, null, 2)}
            </pre>
          </details>
        </>
      ) : (
        <div className="empty-evidence compact">
          <Code2 size={22} />
          <div>
            <strong>No requests yet</strong>
          </div>
        </div>
      )}
    </div>
  );
}
