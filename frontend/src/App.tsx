import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Github, Moon, Sun, LoaderCircle } from "lucide-react";
import { HttpEngine, observeRequests } from "./http-engine";
import { ApiError, money, normalizeIntent, scenarios } from "./model";
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
import type { Run } from "./workflow";
import { LedgerView } from "./Evidence";
import { eventText, time } from "./presentation";
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
const statusText = {
  CREATED: "Accepted",
  PROCESSING: "Processing",
  SUCCEEDED: "Succeeded",
  FAILED: "Declined",
  UNKNOWN: "Unresolved",
};
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
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<Mode>("simulated");
  const [scenario, setScenario] = useState<Outcome>("TIMEOUT_AFTER_SUCCESS");
  const [participants, setParticipants] = useState<string[]>(() =>
    read("participants", ["Jane Tan", "John Lim", "Alex Morgan"]),
  );
  const [sender, setSender] = useState("Jane Tan"),
    [recipient, setRecipient] = useState("John Lim");
  const [name, setName] = useState(""),
    [amount, setAmount] = useState("100.00");
  const [items, setItems] = useState<Payout[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(0);
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [traceMap, setTraceMap] = useState<Record<string, Trace[]>>(() =>
    read("payment-requests", {}),
  );
  const runs = useRef<Record<string, Run>>(read("payment-runs", {}));
  const active = useRef<Run | null>(null),
    locked = useRef(false),
    mounted = useRef(true),
    connectionPromise = useRef<Promise<boolean> | null>(null);
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
  const connect = useCallback(
    (reset = false): Promise<boolean> => {
      if (connectionPromise.current) return connectionPromise.current;
      const task = (async () => {
        try {
          const workspace = await engine.workspace(reset);
          const identity = workspace.expiresAt
            ? String(Math.floor(Date.parse(workspace.expiresAt) / 1000))
            : "persistent";
          const old = read<string | null>("workspace-identity", null);
          if (reset || (old && old !== identity)) {
            runs.current = {};
            save();
            setSnapshots({});
            setLatest(null);
            setExpanded(null);
            setTraceMap({});
            store("payment-requests", {});
            setMessage("Previous session expired. A fresh session is ready.");
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
  const progress = async (snapshot: Snapshot, text: string) => {
    if (!mounted.current) return;
    setLatest(snapshot);
    setSnapshots((previous) => ({
      ...previous,
      [snapshot.payout.id]: snapshot,
    }));
    setMessage(text);
    await refresh();
  };
  const execute = async (run: Run) => {
    if (locked.current) return;
    locked.current = true;
    active.current = run;
    setBusy(true);
    setError("");
    setMessage("Sending payment…");
    try {
      await runPayment(engine, run, save, progress);
      await refresh();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 410) {
        await connect();
        setError("Session expired. The previous payment was not repeated.");
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
          await progress(
            await engine.snapshot(run.id),
            "Latest saved payment status.",
          );
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
      if (sender === recipient)
        throw new Error("Choose different sender and recipient.");
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
  return (
    <main className="demo-shell">
      <header className="site-header">
        <div>
          <h1>Payment simulator</h1>
          <span className="demo-label">Demo · test funds</span>
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
            <div className="form-row">
              <label>
                From
                <select
                  aria-label="From"
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
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
                  {participants.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            </div>
            <details className="participant-add">
              <summary>Add participant</summary>
              <div>
                <input
                  aria-label="Participant name"
                  placeholder="Name"
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button
                  type="button"
                  disabled={!name.trim() || participants.length >= 10}
                  onClick={() => {
                    const value = name.trim();
                    if (!value || participants.includes(value)) return;
                    const next = [...participants, value];
                    setParticipants(next);
                    store("participants", next);
                    setRecipient(value);
                    setName("");
                  }}
                >
                  Add
                </button>
              </div>
            </details>
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
                Provider
                <select
                  aria-label="Provider"
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as Mode);
                    setAmount(
                      e.target.value === "mastercard" ? "53.00" : "100.00",
                    );
                  }}
                >
                  <option value="simulated">Simulated provider</option>
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
              <label>
                Scenario
                <select
                  aria-label="Scenario"
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value as Outcome)}
                >
                  {scenarios.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="field-note">
                Official sandbox test accounts · USD · no real money moves.
                Participant names are demo labels.
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
        {latest && (
          <div className="latest-result" aria-label="Latest payment result">
            <strong>
              {money(latest.payout.amount, latest.payout.currency)} ·{" "}
              {statusText[latest.payout.status]}
            </strong>
            <div>
              Payment engine: <code>{latest.payout.status}</code>
            </div>
            {latest.payout.provider === "simulated" && (
              <div>
                Provider:{" "}
                <code>{latest.provider?.status ?? "No payment record"}</code>
              </div>
            )}
            <div>Reconciliation checks: {latest.attempts.length}</div>
            <div>
              Ledger:{" "}
              {latest.ledger ? "2 balanced entries" : "No entries posted"}
            </div>
          </div>
        )}
        {message && (
          <p role="status" className="operation-status">
            {message}
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
                          <dt>Provider</dt>
                          <dd>
                            {payment.provider === "mastercard"
                              ? "Mastercard sandbox"
                              : "Simulated provider"}
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
                            ? "Idempotency verified: repeating the creation request returned this same payment."
                            : "The idempotency key identifies the original creation request."}
                        </p>
                        <h3>Events</h3>
                        <ol className="events">
                          <li>
                            <span>Payment accepted</span>
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
                                Reconciliation:{" "}
                                {a.providerRecordFound
                                  ? `provider reported ${a.providerStatus}`
                                  : "no provider record found"}
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
        Temporary payment records · no real funds ·{" "}
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
