import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Github, Moon, Sun, LoaderCircle } from "lucide-react";
import { HttpEngine, observeRequests } from "./http-engine";
import {
  ApiError,
  money,
  normalizeIntent,
  participants,
  recipientAfterSenderChange,
  recipientsFor,
  scenarios,
} from "./model";
import type {
  Configuration,
  Mode,
  Outcome,
  Payout,
  Snapshot,
  Trace,
} from "./model";
import Verification from "./Verification";
import { runPayment } from "./workflow";
import type { Run, Step } from "./workflow";
import { Flow, viewOf } from "./Flow";
import { LedgerView } from "./Evidence";
import { eventText, networkStatusText, time } from "./presentation";
import { sleep, stepDelay } from "./pace";
const engine = new HttpEngine();
function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The server remains authoritative when storage is unavailable. */
  }
}
// The statuses are the payment platform's own state names.
const statusText = {
  CREATED: "CREATED",
  PROCESSING: "PROCESSING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
};
const sessionEnded =
  "Your previous session ended after a period of inactivity, so its history was cleared.";
export default function App() {
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const [config, setConfig] = useState<Configuration | null>(null);
  const [connection, setConnection] = useState<
    "connecting" | "ready" | "unavailable"
  >("connecting");
  const [verified, setVerified] = useState(false);
  const verificationReady = useCallback(
    (ready: boolean) => setVerified(ready),
    [],
  );
  const [mode, setMode] = useState<Mode>("simulated");
  const [scenario, setScenario] = useState<Outcome>("TIMEOUT_AFTER_SUCCESS");
  const [sender, setSender] = useState<string>(participants[0]),
    [recipient, setRecipient] = useState<string>(participants[1]);
  const [amount, setAmount] = useState("100.00");
  const [items, setItems] = useState<Payout[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(0);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [steps, setSteps] = useState<Step[]>([]),
    [trace, setTrace] = useState({ title: "", mode: "simulated" as Mode });
  const [traceMap, setTraceMap] = useState<Record<string, Trace[]>>(() =>
    read("payment-requests", {}),
  );
  const runs = useRef<Record<string, Run>>(read("payment-runs", {}));
  const active = useRef<Run | null>(null),
    locked = useRef(false),
    mounted = useRef(true),
    connectionPromise = useRef<Promise<boolean> | null>(null);
  const traceEnd = useRef<HTMLDivElement>(null);
  const save = () => store("payment-runs", runs.current);
  const refresh = useCallback(async (listPage = 0) => {
    const list = await engine.list(listPage);
    if (mounted.current) {
      setItems(list.items);
      setTotal(list.total);
      setPage(list.page);
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("payment-simulator-theme", theme);
    } catch {}
  }, [theme]);
  useEffect(
    () =>
      observeRequests((trace) => {
        const run = active.current;
        const responseId = (trace.response as { id?: string } | null)?.id;
        const id =
          run?.key ?? responseId ?? trace.path.match(/\/payouts\/([^/]+)/)?.[1];
        if (!id) return;
        setTraceMap((previous) => {
          const next = {
            ...previous,
            [id]: [...(previous[id] ?? []), trace].slice(-30),
          };
          store("payment-requests", next);
          return next;
        });
      }),
    [],
  );
  // Keep the newest step in view, so the viewer can follow along.
  useEffect(() => {
    traceEnd.current?.scrollIntoView?.({
      block: "nearest",
      behavior: "smooth",
    });
  }, [steps.length]);
  const connect = useCallback(
    (reset = false): Promise<boolean> => {
      if (connectionPromise.current) return connectionPromise.current;
      const task = (async () => {
        try {
          const workspace = await engine.workspace(reset);
          // The start time identifies the session; it does not change while it is in use.
          const identity = workspace.startedAt ?? "persistent";
          const old = read<string | null>("workspace-identity", null);
          if (reset || (old && old !== identity)) {
            runs.current = {};
            save();
            setSnapshots({});
            setSteps([]);
            setExpanded(null);
            setTraceMap({});
            store("payment-requests", {});
            setNotice(reset ? "" : sessionEnded);
          }
          store("workspace-identity", identity);
          const configuration = await engine.config();
          await refresh();
          if (mounted.current) {
            setConfig(configuration);
            setConnection("ready");
          }
          return true;
        } catch {
          if (mounted.current) setConnection("unavailable");
          return false;
        } finally {
          connectionPromise.current = null;
        }
      })();
      connectionPromise.current = task;
      return task;
    },
    [refresh],
  );
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      if (cancelled) return;
      const ok = await connect();
      if (!ok && !cancelled)
        timer = setTimeout(
          () => void poll(),
          Math.min(15000, 2000 * ++attempts),
        );
    };
    void poll();
    return () => {
      cancelled = true;
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [connect]);
  useEffect(() => {
    if (connection !== "unavailable") return;
    const timer = setInterval(() => {
      if (!locked.current) void connect();
    }, 10000);
    return () => clearInterval(timer);
  }, [connection, connect]);
  const progress = async (snapshot: Snapshot | null, step: Step) => {
    if (!mounted.current) return;
    setSteps((previous) => [...previous, step]);
    if (snapshot) {
      setSnapshots((previous) => ({
        ...previous,
        [snapshot.payout.id]: snapshot,
      }));
      await refresh();
    }
    if (!step.final)
      await sleep(stepDelay(active.current?.intent.provider ?? "simulated"));
  };
  const execute = async (run: Run) => {
    if (locked.current) return;
    locked.current = true;
    active.current = run;
    setBusy(true);
    setError("");
    setNotice("");
    setTrace({
      title: `${run.sender} → ${run.intent.recipientReference} · ${money(run.intent.amount, run.intent.currency)}${
        run.intent.provider === "simulated"
          ? ` · ${scenarios.find((s) => s.id === run.scenario)?.name}`
          : ""
      }`,
      mode: run.intent.provider,
    });
    try {
      await runPayment(engine, run, save, progress);
      await refresh();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 410) {
        await connect();
        setNotice(sessionEnded);
      } else {
        setError(
          failure instanceof Error ? failure.message : "Request failed.",
        );
        if (failure instanceof ApiError && failure.status >= 500)
          await connect();
      }
      // Never automatically create a fresh payment after an ambiguous network result.
      if (run.id) {
        try {
          const saved = await engine.snapshot(run.id);
          setSnapshots((previous) => ({
            ...previous,
            [saved.payout.id]: saved,
          }));
          await refresh();
        } catch {}
      }
    } finally {
      active.current = null;
      locked.current = false;
      setBusy(false);
    }
  };
  const send = () => {
    try {
      const unfinished = Object.values(runs.current).find(
        (run) => !run.complete,
      );
      if (unfinished) {
        setError(
          "A previous request is unfinished. Resume it before sending another payment.",
        );
        return;
      }
      const run: Run = {
        key: `demo-${crypto.randomUUID()}`,
        intent: normalizeIntent({
          recipientReference: recipient,
          amount,
          currency: mode === "mastercard" ? "USD" : "SGD",
          provider: mode,
        }),
        scenario,
        sender,
      };
      runs.current[run.key] = run;
      save();
      setSteps([]);
      void execute(run);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the payment details.",
      );
    }
  };
  const inspect = async (id: string) => {
    setExpanded((current) => (current === id ? null : id));
    try {
      const snapshot = await engine.snapshot(id);
      setSnapshots((previous) => ({ ...previous, [id]: snapshot }));
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 410)
        await connect();
      else
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not load payment.",
        );
    }
  };
  const unfinished = Object.values(runs.current).find((run) => !run.complete);
  const party = {
    from: sender,
    to: recipient,
    amount: money(amount || "0", "SGD"),
  };
  return (
    <main className="demo-shell">
      <header className="site-header">
        <div>
          <h1>Payment simulator</h1>
        </div>
        <div className="header-tools">
          <a
            href="https://github.com/yyan115/payment-processing-simulator"
            target="_blank"
            rel="noreferrer"
            aria-label="View source"
          >
            <Github size={18} />
          </a>
          <button
            type="button"
            aria-label={
              theme === "light"
                ? "Switch to dark theme"
                : "Switch to light theme"
            }
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>
      <p className="intro">
        This simulator sends a test payment and shows how a payment system deals
        with things going wrong. Every payment involves two parties: the payment
        platform, which sends the payment and keeps the records, and the payment
        network, which moves the money. Choose a scenario, then send the payment
        to see each step.
      </p>
      <section className="workspace" aria-label="Payment workspace">
        <div className="connection" role="status">
          <span className={`dot ${connection}`} />
          {connection === "ready"
            ? "Connected"
            : connection === "connecting"
              ? "Connecting…"
              : "Waiting for the server…"}
        </div>
        {connection !== "ready" && (
          <div className="connection-notice">
            <LoaderCircle className="spin" size={18} />
            <div>
              <strong>Connecting to the payment server</strong>
              <p>
                Free hosting may need time to start. We’re checking
                automatically.
              </p>
            </div>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <fieldset disabled={busy || connection !== "ready"}>
            <h2 className="section-label">Payment</h2>
            <div className="form-row">
              <label>
                From
                <select
                  aria-label="From"
                  value={sender}
                  onChange={(e) => {
                    setSender(e.target.value);
                    setRecipient(
                      recipientAfterSenderChange(e.target.value, recipient),
                    );
                  }}
                >
                  {participants.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                To
                <select
                  aria-label="To"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                >
                  {recipientsFor(sender).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Amount ({mode === "mastercard" ? "USD" : "SGD"})
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label="Amount"
                  required
                />
              </label>
              <label>
                Payment network
                <select
                  aria-label="Payment network"
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as Mode);
                    setAmount(
                      e.target.value === "mastercard" ? "53.00" : "100.00",
                    );
                  }}
                >
                  <option value="simulated">Simulated network</option>
                  <option
                    value="mastercard"
                    disabled={!config?.mastercardAvailable}
                  >
                    Mastercard sandbox
                    {!config?.mastercardAvailable ? " — unavailable" : ""}
                  </option>
                </select>
              </label>
            </div>
            {mode === "simulated" ? (
              <div
                className="scenarios"
                role="radiogroup"
                aria-labelledby="scenario-label"
              >
                <h2 className="section-label" id="scenario-label">
                  Scenario
                </h2>
                {scenarios.map((s) => {
                  const on = scenario === s.id;
                  return (
                    <div key={s.id} className={on ? "option on" : "option"}>
                      <label>
                        <input
                          type="radio"
                          name="scenario"
                          value={s.id}
                          checked={on}
                          onChange={() => setScenario(s.id)}
                          aria-labelledby={`${s.id}-name`}
                          aria-describedby={`${s.id}-summary`}
                        />
                        <span>
                          <span className="option-name" id={`${s.id}-name`}>
                            {s.name}
                          </span>
                          <span
                            className="option-summary"
                            id={`${s.id}-summary`}
                          >
                            {s.summary}
                          </span>
                        </span>
                      </label>
                      {on && (
                        <p className="scenario-explanation">
                          {s.explanation(party)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="field-note">
                This sends a request to Mastercard’s sandbox, a test environment
                that uses Mastercard’s official test accounts. Amounts are in
                USD and no real money moves. The names above are labels only.
              </p>
            )}
            {mode === "mastercard" && (
              <Verification onReady={verificationReady} />
            )}
            <button
              className="send-button"
              type="submit"
              disabled={!!unfinished || (mode === "mastercard" && !verified)}
            >
              {busy ? (
                <>
                  <LoaderCircle size={16} className="spin" /> Processing…
                </>
              ) : (
                "Send payment"
              )}
            </button>
          </fieldset>
        </form>
        {steps.length > 0 && (
          <section className="trace" aria-label="Payment progress">
            <h2>{trace.title}</h2>
            <Flow
              view={viewOf(steps)}
              network={
                trace.mode === "mastercard"
                  ? "Mastercard sandbox"
                  : "Payment network"
              }
              working={busy}
            />
            <ol className="timeline" aria-live="polite">
              {steps.map((step, i) => (
                <li
                  key={i}
                  className={`${step.final ? "final " : ""}${step.tone ?? "neutral"}`}
                >
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </li>
              ))}
            </ol>
            <div ref={traceEnd} />
          </section>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {unfinished && !busy && connection === "ready" && (
          <button
            className="resume-button"
            onClick={() => void execute(unfinished)}
          >
            Resume unfinished request
          </button>
        )}
      </section>
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
            const snapshot = snapshots[payment.id];
            const run = Object.values(runs.current).find(
              (r) => r.id === payment.id,
            );
            const open = expanded === payment.id;
            return (
              <article className="payment-row" key={payment.id}>
                <button
                  className="payment-summary"
                  aria-expanded={open}
                  onClick={() => void inspect(payment.id)}
                >
                  <span>
                    <strong>{money(payment.amount, payment.currency)}</strong>
                    <small>
                      {run?.sender ? `${run.sender} → ` : "To "}
                      {payment.recipientReference}
                      {run?.intent.provider === "simulated"
                        ? ` · ${scenarios.find((s) => s.id === run.scenario)?.name}`
                        : ""}
                    </small>
                  </span>
                  <span
                    className={`payment-status ${payment.status.toLowerCase()}`}
                  >
                    {statusText[payment.status]}
                  </span>
                  <ChevronDown size={16} className={open ? "rotated" : ""} />
                </button>
                {open && (
                  <div className="payment-details">
                    {snapshot ? (
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
                          <dd>
                            {payment.provider === "mastercard"
                              ? "Mastercard sandbox"
                              : "Simulated network"}
                          </dd>
                          {run?.intent.provider === "simulated" && (
                            <>
                              <dt>Scenario</dt>
                              <dd>
                                {
                                  scenarios.find((s) => s.id === run.scenario)
                                    ?.name
                                }
                              </dd>
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
                          {snapshot.events.map((e) => (
                            <li key={e.id}>
                              <span>
                                {eventText[e.eventType] ??
                                  e.eventType
                                    .replaceAll("_", " ")
                                    .toLowerCase()}{" "}
                                <small>{e.toStatus}</small>
                              </span>
                              <time>{time(e.createdAt)}</time>
                            </li>
                          ))}
                          {snapshot.attempts.map((a) => (
                            <li key={a.id}>
                              <span>
                                Checked with the network:{" "}
                                {a.providerRecordFound && a.providerStatus
                                  ? networkStatusText[a.providerStatus]
                                  : "it has no record of this payment"}
                              </span>
                              <time>{time(a.createdAt)}</time>
                            </li>
                          ))}
                        </ol>
                        <details>
                          <summary>
                            Ledger ·{" "}
                            {snapshot.ledger
                              ? "2 balanced entries"
                              : "no entries"}
                            <ChevronDown size={14} />
                          </summary>
                          <LedgerView snapshot={snapshot} />
                        </details>
                        <details>
                          <summary>
                            API requests ·{" "}
                            {traceMap[run?.key ?? payment.id]?.length ?? 0}
                            <ChevronDown size={14} />
                          </summary>
                          {traceMap[run?.key ?? payment.id]?.length ? (
                            traceMap[run?.key ?? payment.id].map((t, i) => (
                              <details key={i}>
                                <summary>
                                  <code>
                                    {t.method} {t.path}
                                  </code>
                                  <span>
                                    {t.status
                                      ? `HTTP ${t.status}`
                                      : "No response"}
                                  </span>
                                </summary>
                                <pre>
                                  {JSON.stringify(
                                    {
                                      request: t.request,
                                      response: t.response,
                                    },
                                    null,
                                    2,
                                  )}
                                </pre>
                              </details>
                            ))
                          ) : (
                            <p className="field-note">
                              Request capture is unavailable in this browser
                              tab. Events and ledger are loaded from the server.
                            </p>
                          )}
                        </details>
                      </>
                    ) : (
                      <p>Loading payment details…</p>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
        {total > 20 && (
          <div className="pagination">
            <button
              disabled={page === 0 || busy}
              onClick={() => void refresh(page - 1)}
            >
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button
              disabled={(page + 1) * 20 >= total || busy}
              onClick={() => void refresh(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>
      <footer>
        Test payments only. No real money moves.{" "}
        <button
          disabled={busy || connection !== "ready"}
          onClick={() => {
            if (window.confirm("Clear this demo’s history?"))
              void connect(true);
          }}
        >
          Clear history
        </button>
      </footer>
    </main>
  );
}
