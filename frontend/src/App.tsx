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
  LedgerAccount,
  LedgerPosting,
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
import { JournalEntry, Ledger } from "./Evidence";
import { eventText, networkStatusText, time } from "./presentation";
import { savedPlayback, savePlayback, sleep, stepDelay } from "./pace";
import type { Playback } from "./pace";
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
// How long a workspace may sit idle, as a phrase for the expiry message.
function idlePhrase(seconds: number) {
  const hours = Math.round(seconds / 3600);
  if (seconds >= 3600) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
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
  const [expired, setExpired] = useState<{ action: boolean } | null>(null);
  const [idleSeconds, setIdleSeconds] = useState(21600);
  const expiredDialog = useRef<HTMLDialogElement>(null);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [postings, setPostings] = useState<LedgerPosting[]>([]);
  const [playback, setPlayback] = useState<Playback>(savedPlayback);
  const [waiting, setWaiting] = useState(false);
  const playbackRef = useRef(playback),
    release = useRef<(() => void) | null>(null);
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
  const traceEnd = useRef<HTMLDivElement>(null),
    runPanel = useRef<HTMLElement>(null);
  const save = () => store("payment-runs", runs.current);
  const refresh = useCallback(async (listPage = 0) => {
    const list = await engine.list(listPage);
    if (mounted.current) {
      setItems(list.items);
      setTotal(list.total);
      setPage(list.page);
    }
  }, []);
  const refreshLedger = useCallback(async () => {
    try {
      const [list, lines] = await Promise.all([
        engine.ledgerAccounts(),
        engine.ledgerEntries(),
      ]);
      if (mounted.current) {
        setAccounts(list);
        setPostings(lines);
      }
    } catch {
      /* The totals are reloaded after the next payment. */
    }
  }, []);
  const changePlayback = (value: Playback) => {
    playbackRef.current = value;
    setPlayback(value);
    savePlayback(value);
    // Switching to automatic while a step is waiting lets the run carry on.
    if (value === "auto") release.current?.();
  };
  useEffect(() => {
    const dialog = expiredDialog.current;
    if (expired && dialog && !dialog.open) dialog.showModal?.();
  }, [expired]);
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
  // Bring a new run into view, then keep the newest step in view.
  useEffect(() => {
    if (steps.length === 1)
      runPanel.current?.scrollIntoView?.({
        block: "start",
        behavior: "smooth",
      });
    else
      traceEnd.current?.scrollIntoView?.({
        block: "nearest",
        behavior: "smooth",
      });
  }, [steps.length, waiting]);
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
            if (!reset) setExpired({ action: false });
          }
          store("workspace-identity", identity);
          if (workspace.durationSeconds > 0)
            setIdleSeconds(workspace.durationSeconds);
          const configuration = await engine.config();
          await refresh();
          await refreshLedger();
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
    [refresh, refreshLedger],
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
    if (step.ledger && snapshot?.ledger) void refreshLedger();
    if (step.final) return;
    if (playbackRef.current === "step") {
      setWaiting(true);
      await new Promise<void>((resolve) => {
        release.current = resolve;
      });
      release.current = null;
      if (mounted.current) setWaiting(false);
    } else {
      await sleep(stepDelay(active.current?.intent.provider ?? "simulated"));
    }
  };
  const execute = async (run: Run) => {
    if (locked.current) return;
    locked.current = true;
    active.current = run;
    setBusy(true);
    setError("");
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
      await refreshLedger();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 410) {
        await connect();
        setExpired({ action: true });
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
      setWaiting(false);
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
  // Names a payment in the ledger, using what this browser knows about it.
  const paymentLabel = (id: string) => {
    const payment = items.find((item) => item.id === id);
    if (!payment) return `Payment ${id.slice(0, 8)}`;
    const run = Object.values(runs.current).find((r) => r.id === id);
    return `${run?.sender ? `${run.sender} → ` : ""}${payment.recipientReference}`;
  };
  const party = {
    from: sender,
    to: recipient,
    amount: money(amount || "0", "SGD"),
  };
  return (
    <main className="page">
      <div className="hero">
        <header className="topbar">
          <div className="container bar">
            <h1>Payment simulator</h1>
            <div className="header-tools">
              <div className="connection" role="status">
                <span className={`dot ${connection}`} />
                <span className="connection-text">
                  {connection === "ready"
                    ? "Connected"
                    : connection === "connecting"
                      ? "Connecting…"
                      : "Waiting for the server…"}
                </span>
              </div>
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
          </div>
        </header>
        <div className="container hero-body">
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
            className="hero-grid"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <div className="hero-copy">
              <div className="intro">
                <p>
                  This simulator sends a test payment and shows how a payment
                  system deals with things going wrong.
                </p>
                <p>
                  Every payment involves two parties: the payment platform,
                  which sends the payment and keeps the records, and the payment
                  network, which moves the money. Choose a scenario, then send
                  the payment to see each step.
                </p>
              </div>
              <fieldset disabled={busy || connection !== "ready"}>
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
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="field-note">
                    This sends a request to the Mastercard API sandbox, a test
                    environment that uses Mastercard’s official test accounts.
                    Amounts are in USD and no real money moves. The names are
                    labels only.
                  </p>
                )}
                {mode === "mastercard" && (
                  <Verification onReady={verificationReady} />
                )}
              </fieldset>
            </div>
            {mode === "simulated" && (
              <div className="scenario-explanation">
                {scenarios
                  .find((s) => s.id === scenario)
                  ?.explanation(party)
                  .map((text, i) => (
                    <p key={i}>{text}</p>
                  ))}
              </div>
            )}
            <section className="card" aria-label="Payment workspace">
              <fieldset disabled={busy || connection !== "ready"}>
                <div className="amount">
                  <label htmlFor="amount">You send</label>
                  <div className="amount-field">
                    <input
                      id="amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      aria-label="Amount"
                      required
                    />
                    <span className="currency">
                      {mode === "mastercard" ? "USD" : "SGD"}
                    </span>
                  </div>
                </div>
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
                    {config?.mastercardAvailable && (
                      <option value="mastercard">Mastercard API sandbox</option>
                    )}
                  </select>
                </label>
              </fieldset>
              <div className="send-row">
                <div className="playback" role="group" aria-label="Playback">
                  <span>Playback</span>
                  {(["auto", "step"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={playback === value}
                      onClick={() => changePlayback(value)}
                    >
                      {value === "auto" ? "Automatic" : "Step by step"}
                    </button>
                  ))}
                </div>
                <button
                  className="send-button"
                  type="submit"
                  disabled={
                    busy ||
                    connection !== "ready" ||
                    !!unfinished ||
                    (mode === "mastercard" && !verified)
                  }
                >
                  {busy ? (
                    <>
                      <LoaderCircle size={16} className="spin" /> Processing…
                    </>
                  ) : (
                    "Send payment"
                  )}
                </button>
              </div>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              {unfinished && !busy && connection === "ready" && (
                <button
                  type="button"
                  className="resume-button"
                  onClick={() => void execute(unfinished)}
                >
                  Resume unfinished request
                </button>
              )}
            </section>
          </form>
        </div>
      </div>
      <div className="container below">
        {steps.length > 0 && (
          <section className="run" aria-label="Payment progress" ref={runPanel}>
            <div className="flow-wrap">
              <h2>{trace.title}</h2>
              <Flow
                view={viewOf(steps)}
                network={
                  trace.mode === "mastercard"
                    ? "Mastercard API sandbox"
                    : "Payment network"
                }
                working={busy && !waiting}
              />
            </div>
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
            {waiting && (
              <button
                type="button"
                className="next-step"
                onClick={() => release.current?.()}
              >
                Next step
              </button>
            )}
            <div ref={traceEnd} className="scroll-end" />
          </section>
        )}
        <div className="books">
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
                        <strong>
                          {money(payment.amount, payment.currency)}
                        </strong>
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
                      <ChevronDown
                        size={16}
                        className={open ? "rotated" : ""}
                      />
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
                                  ? "Mastercard API sandbox"
                                  : "Simulated network"}
                              </dd>
                              {run?.intent.provider === "simulated" && (
                                <>
                                  <dt>Scenario</dt>
                                  <dd>
                                    {
                                      scenarios.find(
                                        (s) => s.id === run.scenario,
                                      )?.name
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
                                Journal entry ·{" "}
                                {snapshot.ledger ? "posted" : "not posted"}
                                <ChevronDown size={14} />
                              </summary>
                              <JournalEntry snapshot={snapshot} />
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
                                  tab. Events and the journal entry are loaded
                                  from the server.
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
        </div>
        <footer>
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
      </div>
      {expired && (
        <dialog
          ref={expiredDialog}
          className="expired"
          aria-labelledby="expired-title"
          onCancel={(event) => event.preventDefault()}
        >
          <h2 id="expired-title">Session expired</h2>
          <p>
            This page was inactive for more than {idlePhrase(idleSeconds)}, so
            its payments and ledger were cleared.
            {expired.action ? " Your last action was not carried out." : ""}
          </p>
          <button type="button" autoFocus onClick={() => setExpired(null)}>
            OK
          </button>
        </dialog>
      )}
    </main>
  );
}
