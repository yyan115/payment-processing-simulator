import { ChevronDown } from "lucide-react";
import type { Payout, Snapshot, Trace } from "../api/types";
import { eventLines } from "../domain/events";
import { time } from "../domain/format";
import { networkNames } from "../domain/networks";
import { scenarios } from "../domain/scenarios";
import type { Run } from "../domain/workflow";
import { JournalEntry } from "./Ledger";

// Everything the browser knows about one payment, including its identifiers, events, journal and API calls.
export function PaymentDetails({
  payment,
  snapshot,
  run,
  traces,
}: {
  payment: Payout;
  snapshot: Snapshot | undefined;
  run: Run | undefined;
  traces: Trace[];
}) {
  if (!snapshot) return <p>Loading payment details…</p>;
  const scenario =
    run?.intent.provider === "simulated"
      ? scenarios.find((s) => s.id === run.scenario)?.name
      : undefined;
  return (
    <>
      <dl className="identifiers">
        <dt>Payment ID</dt>
        <dd>
          <code>{payment.id}</code>
        </dd>
        {run && (
          <>
            <dt>Idempotency key</dt>
            <dd>
              <code>{run.key}</code>
            </dd>
          </>
        )}
        <dt>Payment network</dt>
        <dd>{networkNames[payment.provider]}</dd>
        {scenario && (
          <>
            <dt>Scenario</dt>
            <dd>{scenario}</dd>
          </>
        )}
      </dl>
      <p className="field-note">
        {run?.complete
          ? "Idempotency verified: repeating the request returned this same payment."
          : "The idempotency key identifies the original request."}
      </p>
      <h3>Events</h3>
      <ol className="events">
        <li>
          <span>Payment created</span>
          <time>{time(payment.createdAt)}</time>
        </li>
        {eventLines(snapshot).map((line) => (
          <li key={line.id}>
            <span>
              {line.text} {line.status && <small>{line.status}</small>}
            </span>
            <time>{time(line.at)}</time>
          </li>
        ))}
      </ol>
      <details>
        <summary>
          Journal entry · {snapshot.ledger ? "posted" : "not posted"}
          <ChevronDown size={14} />
        </summary>
        <JournalEntry snapshot={snapshot} />
      </details>
      <details>
        <summary>
          API requests · {traces.length}
          <ChevronDown size={14} />
        </summary>
        {traces.length ? (
          traces.map((t, i) => (
            <details key={i}>
              <summary>
                <code>
                  {t.method} {t.path}
                </code>
                <span>{t.status ? `HTTP ${t.status}` : "No response"}</span>
              </summary>
              <pre>
                {JSON.stringify(
                  { request: t.request, response: t.response },
                  null,
                  2,
                )}
              </pre>
            </details>
          ))
        ) : (
          <p className="field-note">
            Request capture is unavailable in this browser tab. Events and the
            journal entry are loaded from the server.
          </p>
        )}
      </details>
    </>
  );
}
