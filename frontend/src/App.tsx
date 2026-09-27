import {
  StatusBadge,
  labels,
  shortId,
  statusClass,
  time,
} from "./presentation";
import { Timeline, LedgerView, RequestView } from "./Evidence";
import Learn from "./Learn";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Database,
  ExternalLink,
  Fingerprint,
  Github,
  History,
  Landmark,
  Layers3,
  LoaderCircle,
  Menu,
  Moon,
  Sun,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Unplug,
  Wallet,
  Waypoints,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { HttpEngine, observeRequests } from "./http-engine";
import {
  ApiError,
  currencies,
  money,
  normalizeIntent,
  scenarios,
} from "./model";
import type {
  Configuration,
  Intent,
  Mode,
  Outcome,
  Page,
  ProviderObservation,
  Snapshot,
  Trace,
  Workspace,
} from "./model";

const engine = new HttpEngine();
type View = Mode | "learn";
type Theme = "light" | "dark";
type Original = { key: string; intent: Intent; scenario: Outcome };
const freshKey = () => `demo-${crypto.randomUUID()}`;
function readOriginals(): Record<string, Original> {
  try {
    return JSON.parse(sessionStorage.getItem("payout-originals") ?? "{}");
  } catch {
    return {};
  }
}

export default function App() {
  const [view, setView] = useState<View>("simulated");
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const [demoIntroOpen, setDemoIntroOpen] = useState(false);
  const mode: Mode = view === "mastercard" ? "mastercard" : "simulated";
  const [configuration, setConfiguration] = useState<Configuration | null>(
    null,
  );
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState("");
  const [scenario, setScenario] = useState<Outcome>("TIMEOUT_AFTER_SUCCESS");
  const [amount, setAmount] = useState("100.00");
  const [currency, setCurrency] = useState("SGD");
  const [recipient, setRecipient] = useState("Alex Morgan");
  const [requestKey, setRequestKey] = useState(freshKey);
  const [selected, setSelected] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [observation, setObservation] = useState<ProviderObservation | null>(
    null,
  );
  const [payouts, setPayouts] = useState<Page>({
    items: [],
    total: 0,
    page: 0,
    size: 20,
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [detail, setDetail] = useState<"timeline" | "ledger" | "request">(
    "timeline",
  );
  const [traces, setTraces] = useState<Trace[]>([]);
  const [now, setNow] = useState(Date.now());
  const originals = useRef(readOriginals());
  const selection = useRef<string | null>(null);
  const operation = useRef(false);
  const currentMode = useRef<Mode>(mode);
  const initialization = useRef<Promise<Workspace> | null>(null);

  const dismissDemoIntro = useCallback(() => {
    setDemoIntroOpen(false);
    try {
      if (workspace?.expiresAt)
        sessionStorage.setItem("demo-notice-dismissed", workspace.expiresAt);
    } catch {
      // The notice still closes when browser storage is unavailable.
    }
  }, [workspace?.expiresAt]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0c1325" : "#f7f4ef");
    try {
      localStorage.setItem("payment-simulator-theme", theme);
    } catch {
      // Theme switching also works without persistent browser storage.
    }
  }, [theme]);
  useEffect(
    () =>
      observeRequests((trace) =>
        setTraces((previous) => [trace, ...previous].slice(0, 12)),
      ),
    [],
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!historyOpen && !resetOpen && !expired && !demoIntroOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)",
        ) ?? [],
      );
    (
      dialog?.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0]
    )?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !expired) {
        setHistoryOpen(false);
        setResetOpen(false);
        if (demoIntroOpen) dismissDemoIntro();
      }
      if (event.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [historyOpen, resetOpen, expired, demoIntroOpen, dismissDemoIntro]);
  const fail = useCallback((failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 410) setExpired(true);
    setError(
      failure instanceof Error ? failure.message : "Request failed. Try again.",
    );
  }, []);
  const initialize = useCallback(async () => {
    setInitializing(true);
    setConnectionError("");
    try {
      const session = await (initialization.current ??= engine.workspace());
      const [config, list] = await Promise.all([
        engine.config(),
        engine.list(),
      ]);
      setWorkspace(session);
      if (session.temporary) {
        try {
          setDemoIntroOpen(
            Date.parse(
              sessionStorage.getItem("demo-notice-dismissed") ?? "",
            ) !== Date.parse(session.expiresAt ?? ""),
          );
        } catch {
          setDemoIntroOpen(true);
        }
      }
      setConfiguration(config);
      setPayouts(list);
      setExpired(false);
    } catch (failure) {
      initialization.current = null;
      setConnectionError(
        failure instanceof Error
          ? failure.message
          : "Cannot connect to the backend.",
      );
    } finally {
      setInitializing(false);
    }
  }, []);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  const refresh = useCallback(async (id = selection.current) => {
    const [list, next] = await Promise.all([
      engine.list(),
      id ? engine.snapshot(id) : Promise.resolve(null),
    ]);
    setPayouts(list);
    if (id === selection.current) setSnapshot(next);
    return next;
  }, []);
  useEffect(() => {
    if (!selected || busy || expired) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        engine
          .snapshot(selected)
          .then((next) => {
            if (selection.current === selected) setSnapshot(next);
          })
          .catch(fail);
    }, 3000);
    return () => clearInterval(timer);
  }, [selected, busy, expired, fail]);
  useEffect(() => {
    if (workspace?.expiresAt && now >= Date.parse(workspace.expiresAt))
      setExpired(true);
  }, [workspace, now]);
  const act = async (label: string, action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      fail(failure);
    } finally {
      operation.current = false;
      setBusy("");
    }
  };
  const select = async (id: string) => {
    selection.current = id;
    setSelected(id);
    setObservation(null);
    setSnapshot(null);
    setTraces([]);
    setError("");
    setNotice("");
    try {
      const next = await engine.snapshot(id);
      if (selection.current !== id) return;
      const nextMode =
        next.payout.provider ?? configuration?.defaultProvider ?? "simulated";
      setView(nextMode);
      currentMode.current = nextMode;
      setSnapshot(next);
      setAmount(String(next.payout.amount));
      setCurrency(next.payout.currency);
      setRecipient(next.payout.recipientReference);
      const original = originals.current[id];
      if (original) {
        setRequestKey(original.key);
        setScenario(original.scenario);
      }
      setHistoryOpen(false);
    } catch (failure) {
      fail(failure);
    }
  };
  const newDraft = (nextMode = currentMode.current) => {
    selection.current = null;
    setSelected(null);
    setSnapshot(null);
    setObservation(null);
    setRequestKey(freshKey());
    setError("");
    setNotice("");
    setDetail("timeline");
    setTraces([]);
    setAmount(nextMode === "mastercard" ? "53.00" : "100.00");
    setCurrency(nextMode === "mastercard" ? "USD" : "SGD");
    setRecipient(nextMode === "mastercard" ? "Jane Smith" : "Alex Morgan");
  };
  const navigate = (next: View) => {
    if (busy) return;
    setView(next);
    setMobileNav(false);
    if (next !== "learn" && next !== currentMode.current) {
      currentMode.current = next;
      newDraft(next);
    }
  };
  const create = () =>
    act("Creating payout", async () => {
      const intent = normalizeIntent({
        recipientReference: recipient,
        amount,
        currency,
        provider: mode,
      });
      const result = await engine.create(requestKey, intent);
      originals.current[result.payout.id] = {
        key: requestKey,
        intent,
        scenario,
      };
      sessionStorage.setItem(
        "payout-originals",
        JSON.stringify(originals.current),
      );
      selection.current = result.payout.id;
      setSelected(result.payout.id);
      await refresh(result.payout.id);
      requestAnimationFrame(() =>
        document.querySelector(".flow-panel")?.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
          block: "center",
        }),
      );
      setNotice(
        result.created
          ? "Payout created. Ready to send."
          : "Existing payout returned.",
      );
    });
  const send = () =>
    act("Sending payout", async () => {
      if (!selected) return;
      if (mode === "simulated") await engine.configure(selected, scenario);
      await engine.process(selected);
      await refresh(selected);
    });
  const reconcile = () =>
    act("Reconciling", async () => {
      if (!selected) return;
      await engine.reconcile(selected);
      const next = await refresh(selected);
      setNotice(
        next?.payout.status === "UNKNOWN"
          ? "Outcome still unknown. No ledger entries posted."
          : "Reconciliation complete.",
      );
    });
  const retry = () =>
    act("Retrying payout", async () => {
      if (selected) {
        await engine.retry(selected);
        await refresh(selected);
      }
    });
  const advance = (status: "SUCCEEDED" | "DECLINED") =>
    act("Updating provider", async () => {
      if (!selected) return;
      await engine.advance(selected, status);
      await refresh(selected);
      setNotice("Provider updated. Reconcile to update the payout.");
    });
  const lookup = () =>
    act("Checking Mastercard", async () => {
      if (!selected) return;
      const result = await engine.lookup(selected);
      setObservation(result);
      setNotice(
        result.provider
          ? "Mastercard transaction found."
          : "No matching transaction. Outcome remains unconfirmed.",
      );
    });
  const replay = () =>
    act("Replaying request", async () => {
      if (!selected) return;
      const original = originals.current[selected];
      if (!original) return;
      const result = await engine.create(original.key, original.intent);
      await refresh(selected);
      setNotice(
        !result.created && result.payout.id === selected
          ? "Original payout returned. No duplicate created."
          : "Unexpected payout returned. Check its reference.",
      );
    });
  const conflictingReplay = () =>
    act("Testing conflict", async () => {
      if (!selected) return;
      const original = originals.current[selected];
      if (!original) return;
      try {
        await engine.create(original.key, {
          ...original.intent,
          recipientReference: `${original.intent.recipientReference.slice(0, 240)} (changed)`,
        });
        setError("Unexpected result: conflicting request accepted.");
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 409)
          setNotice("HTTP 409: conflicting request rejected.");
        else throw failure;
      }
      await refresh(selected);
    });
  const reset = () =>
    act("Resetting demo", async () => {
      const session = await engine.workspace(true);
      initialization.current = Promise.resolve(session);
      setWorkspace(session);
      setExpired(false);
      setResetOpen(false);
      setDemoIntroOpen(false);
      try {
        if (session.expiresAt)
          sessionStorage.setItem("demo-notice-dismissed", session.expiresAt);
      } catch {
        // Reset does not depend on browser storage.
      }
      originals.current = {};
      sessionStorage.removeItem("payout-originals");
      newDraft();
      await refresh(null);
    });

  const payout = snapshot?.payout;
  const provider =
    mode === "simulated" ? snapshot?.provider : observation?.provider;
  const scenarioInfo = scenarios.find((item) => item.id === scenario)!;
  const remaining = workspace?.expiresAt
    ? Math.min(
        workspace.durationSeconds,
        Math.max(0, Math.ceil((Date.parse(workspace.expiresAt) - now) / 1000)),
      )
    : null;
  const countdown =
    remaining === null
      ? "No expiry"
      : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  const terminal =
    payout?.status === "SUCCEEDED" || payout?.status === "FAILED";
  const original = selected ? originals.current[selected] : null;
  const scenarioKnown = !payout || !!original;
  const providerPending =
    mode === "simulated" &&
    (provider?.status === "PENDING" || provider?.status === "UNKNOWN");
  const blocked =
    !!busy ||
    (!!selected && !snapshot) ||
    initializing ||
    !!connectionError ||
    expired ||
    (mode === "mastercard" && !configuration?.mastercardAvailable);
  const amountLabel = payout
    ? money(payout.amount, payout.currency)
    : /^\d+(\.\d+)?$/.test(amount)
      ? money(amount, currency)
      : "—";

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${mobileNav ? "is-open" : ""}`}
        inert={demoIntroOpen || historyOpen || resetOpen || expired}
      >
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate("simulated");
          }}
        >
          <span className="brand-symbol">
            <Waypoints size={24} />
          </span>
          <span>
            Payment
            <span className="brand-second">
              Simulator<span className="brand-dot">.</span>
            </span>
          </span>
        </a>

        <nav aria-label="Main navigation">
          <button
            className={view === "simulated" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("simulated")}
            disabled={!!busy}
          >
            <Layers3 size={19} />
            <span>Simulator</span>
          </button>
          <button
            className={view === "mastercard" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("mastercard")}
            disabled={!!busy}
          >
            <Landmark size={19} />
            <span>Mastercard sandbox</span>
          </button>
          <button
            className={view === "learn" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("learn")}
            disabled={!!busy}
          >
            <BookOpen size={19} />
            <span>How it works</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          {workspace?.temporary && (
            <button
              className="reset-demo"
              onClick={() => {
                setMobileNav(false);
                setResetOpen(true);
              }}
              disabled={!!busy}
            >
              <RotateCcw size={14} /> Reset demo
            </button>
          )}
          <a
            className="source-link"
            href="https://github.com/yyan115/payment-processing-simulator"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={16} /> View source <ArrowUpRight size={14} />
          </a>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <main
        className="main-shell"
        inert={demoIntroOpen || historyOpen || resetOpen || expired}
      >
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <span>Payments</span>
            <span className="crumb-slash">/</span>
            <strong>
              {view === "learn"
                ? "How it works"
                : view === "mastercard"
                  ? "Mastercard sandbox"
                  : "Simulator"}
            </strong>
          </div>
          <div className="topbar-right">
            {workspace?.temporary && (
              <button
                className="demo-session"
                onClick={() => setDemoIntroOpen(true)}
                aria-label={`Demo information, ${countdown} remaining`}
              >
                <span>Demo</span>
                <span aria-hidden="true">·</span>
                <time>{countdown}</time>
              </button>
            )}
            <div className="theme-switch" role="group" aria-label="Color theme">
              <button
                aria-label="Light"
                aria-pressed={theme === "light"}
                onClick={() => setTheme("light")}
                title="Light theme"
              >
                <Sun size={15} />
                <span>Light</span>
              </button>
              <button
                aria-label="Dark"
                aria-pressed={theme === "dark"}
                onClick={() => setTheme("dark")}
                title="Dark theme"
              >
                <Moon size={15} />
                <span>Dark</span>
              </button>
            </div>
            <span className={`connection ${connectionError ? "offline" : ""}`}>
              <span />
              {initializing
                ? "Connecting…"
                : connectionError
                  ? "Backend unavailable"
                  : "Backend connected"}
            </span>
            <button
              className="button small subtle history-button"
              aria-label={`History (${payouts.total})`}
              onClick={() => {
                setHistoryOpen(true);
                void engine.list().then(setPayouts).catch(fail);
              }}
              disabled={initializing || !!connectionError || !!busy}
            >
              <History size={15} />
              <span className="history-label">History</span>
              <span className="count">{payouts.total}</span>
            </button>
          </div>
        </header>
        <div className="page-content">
          {connectionError ? (
            <div className="connection-screen">
              <Unplug size={38} />
              <h1>Backend unavailable</h1>
              <p>{connectionError}</p>
              <p>Check the server connection and try again.</p>
              <button
                className="button primary"
                onClick={() => void initialize()}
                disabled={initializing}
              >
                <RefreshCw size={16} /> Reconnect
              </button>
            </div>
          ) : view === "learn" ? (
            <Learn onStart={() => navigate("simulated")} />
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <h1>
                    {mode === "simulated" ? "Simulator" : "Mastercard sandbox"}
                  </h1>
                </div>
                <div className="test-money">
                  <ShieldCheck size={17} />
                  <span>Test funds</span>
                </div>
              </section>
              {mode === "mastercard" && (
                <div
                  className={`mastercard-intro ${configuration?.mastercardAvailable ? "" : "not-configured"}`}
                >
                  <div className="provider-logo">
                    <Landmark size={23} />
                  </div>
                  <div>
                    <strong>
                      {configuration?.mastercardAvailable
                        ? "Mastercard Send · Configured"
                        : "Mastercard Send · Not configured"}
                    </strong>
                    <p>
                      {configuration?.mastercardAvailable
                        ? "Authenticated sandbox requests. Simulated responses; no real funds move."
                        : "Sandbox credentials are required. See the integration guide to configure them."}
                    </p>
                  </div>
                  <a
                    href="https://github.com/yyan115/payment-processing-simulator/blob/main/docs/mastercard.md"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Integration guide <ExternalLink size={14} />
                  </a>
                </div>
              )}
              <div className="experiment-grid">
                <div className="experiment-main">
                  {mode === "simulated" && (
                    <section className="panel scenario-panel">
                      <div className="panel-heading">
                        <h2>Scenario</h2>
                      </div>
                      <div className="scenario-grid">
                        {scenarios.map((item, index) => (
                          <button
                            key={item.id}
                            className={`scenario-card ${scenarioKnown && scenario === item.id ? "selected" : ""}`}
                            disabled={!!busy || !!payout}
                            onClick={() => {
                              setScenario(item.id);
                              setError("");
                            }}
                            aria-pressed={scenarioKnown && scenario === item.id}
                          >
                            <span className="scenario-icon">
                              {index === 0 ? (
                                <Unplug size={18} />
                              ) : index === 1 ? (
                                <CheckCircle2 size={18} />
                              ) : index === 2 ? (
                                <XCircle size={18} />
                              ) : index === 3 ? (
                                <Send size={18} />
                              ) : index === 4 ? (
                                <Clock3 size={18} />
                              ) : (
                                <CircleHelp size={18} />
                              )}
                            </span>
                            <span>
                              <strong>{item.name}</strong>
                            </span>
                            <span className="radio-indicator">
                              {scenarioKnown && scenario === item.id && (
                                <Check size={11} />
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                      <details className="scenario-help">
                        <summary>Scenario details</summary>
                        <p>
                          {scenarioKnown
                            ? scenarioInfo.description
                            : "Original scenario unavailable in this browser tab."}
                        </p>
                      </details>
                    </section>
                  )}
                  <section className="panel payout-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Payout</h2>
                      </div>
                      <span className="quiet">
                        {payout
                          ? "Read-only"
                          : mode === "mastercard"
                            ? "Sandbox test recipient"
                            : ""}
                      </span>
                    </div>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!payout) void create();
                      }}
                    >
                      <div className="form-grid">
                        <label className="recipient-field">
                          Recipient
                          <input
                            aria-label="Recipient"
                            value={recipient}
                            onChange={(event) =>
                              setRecipient(event.target.value)
                            }
                            disabled={
                              !!payout || mode === "mastercard" || !!busy
                            }
                            maxLength={255}
                            required
                            autoComplete="off"
                          />
                        </label>
                        <label>
                          Amount
                          <input
                            aria-label="Payout amount"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            disabled={!!payout || !!busy}
                            inputMode="decimal"
                            maxLength={20}
                            required
                          />
                        </label>
                        <label>
                          Currency
                          <select
                            aria-label="Currency"
                            value={currency}
                            onChange={(event) =>
                              setCurrency(event.target.value)
                            }
                            disabled={
                              !!payout || mode === "mastercard" || !!busy
                            }
                          >
                            {Object.keys(currencies).map((code) => (
                              <option key={code}>{code}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="payout-action-row">
                        <div className="request-reference">
                          <Fingerprint size={16} />
                          <span>
                            {selected ? (
                              <>
                                Payout{" "}
                                <code title={selected}>
                                  {shortId(selected)}
                                </code>
                              </>
                            ) : (
                              <>New payout</>
                            )}
                          </span>
                        </div>
                        {!payout ? (
                          <button
                            type="submit"
                            className="button primary"
                            disabled={blocked}
                          >
                            {busy ? (
                              <LoaderCircle className="spin" size={17} />
                            ) : (
                              <span>Create payout</span>
                            )}
                            {!busy && <ArrowRight size={17} />}
                          </button>
                        ) : (
                          <StatusBadge status={payout.status} />
                        )}
                      </div>
                    </form>
                  </section>
                  <section
                    className={`panel flow-panel ${busy ? "working" : ""}`}
                  >
                    <div className="panel-heading">
                      <div>
                        <h2>Status</h2>
                      </div>
                    </div>
                    <div className="payment-flow">
                      <FlowNode
                        icon={<Wallet size={21} />}
                        label="Payment request"
                        value={amountLabel}
                        sub={
                          payout
                            ? `To ${payout.recipientReference}`
                            : `To ${recipient || "recipient"}`
                        }
                        tone={payout ? "ready" : ""}
                      />
                      <FlowArrow active={!!payout} />
                      <FlowNode
                        icon={<Layers3 size={21} />}
                        label="Payment engine"
                        value={payout ? labels[payout.status] : "Not created"}
                        tone={statusClass(payout?.status)}
                      />
                      <FlowArrow
                        active={!!payout && payout.status !== "CREATED"}
                        uncertain={payout?.status === "UNKNOWN"}
                      />
                      <FlowNode
                        icon={
                          mode === "simulated" ? (
                            <Waypoints size={21} />
                          ) : (
                            <Landmark size={21} />
                          )
                        }
                        label={
                          mode === "simulated"
                            ? "Simulated provider"
                            : "Mastercard sandbox"
                        }
                        value={
                          provider
                            ? labels[provider.status]
                            : mode === "mastercard" && payout?.providerReference
                              ? "Response received"
                              : payout && payout.status !== "CREATED"
                                ? "No record"
                                : "Not sent"
                        }
                        sub={
                          provider?.providerReference
                            ? shortId(provider.providerReference)
                            : undefined
                        }
                        tone={statusClass(provider?.status)}
                      />
                    </div>
                    <div
                      className={`outcome-note ${statusClass(payout?.status)}`}
                    >
                      <span>
                        {payout?.status === "SUCCEEDED" ? (
                          <CheckCircle2 size={20} />
                        ) : payout?.status === "FAILED" ? (
                          <XCircle size={20} />
                        ) : payout?.status === "UNKNOWN" ? (
                          <CircleHelp size={20} />
                        ) : (
                          <ArrowRight size={20} />
                        )}
                      </span>
                      <div>
                        <strong>
                          {!payout
                            ? "Create a payout to begin."
                            : payout.status === "CREATED"
                              ? "Ready to send"
                              : payout.status === "SUCCEEDED"
                                ? "Payout confirmed"
                                : payout.status === "FAILED"
                                  ? "Payout failed"
                                  : payout.status === "UNKNOWN" &&
                                      provider?.status === "SUCCEEDED"
                                    ? "Provider succeeded; reconciliation required."
                                    : payout.status === "UNKNOWN"
                                      ? "Outcome unknown"
                                      : "Processing"}
                        </strong>
                        {payout?.status === "UNKNOWN" && (
                          <p>
                            Reconcile checks the provider. Retry resubmits the
                            same reference.
                          </p>
                        )}
                      </div>
                    </div>
                    {providerPending && (
                      <div className="provider-controls">
                        <div>
                          <strong>Set provider outcome</strong>
                          <span>
                            Reconcile afterwards to update the payout.
                          </span>
                        </div>
                        <div>
                          <button
                            className="button small"
                            disabled={blocked}
                            onClick={() => void advance("SUCCEEDED")}
                          >
                            <Check size={15} />
                            Approve at provider
                          </button>
                          <button
                            className="button small subtle"
                            disabled={blocked}
                            onClick={() => void advance("DECLINED")}
                          >
                            Decline at provider
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flow-actions">
                      <div className="action-hint">
                        {busy ? (
                          <>
                            <LoaderCircle className="spin" size={15} />
                            {busy}…
                          </>
                        ) : null}
                      </div>
                      <div className="action-buttons">
                        {payout?.status === "CREATED" && (
                          <button
                            className="button primary"
                            onClick={() => void send()}
                            disabled={blocked}
                          >
                            <Send size={16} />
                            Send payout
                          </button>
                        )}
                        {payout?.status === "UNKNOWN" && (
                          <>
                            <button
                              className="button"
                              onClick={() => void retry()}
                              disabled={blocked}
                            >
                              <RotateCcw size={15} />
                              Retry
                            </button>
                            <button
                              className="button primary"
                              onClick={() => void reconcile()}
                              disabled={blocked}
                            >
                              <RefreshCw size={15} />
                              Reconcile
                            </button>
                          </>
                        )}
                        {mode === "mastercard" &&
                          payout &&
                          payout.status !== "CREATED" && (
                            <button
                              className="button"
                              onClick={() => void lookup()}
                              disabled={blocked}
                            >
                              <Landmark size={15} />
                              Check Mastercard
                            </button>
                          )}
                        {terminal && (
                          <button
                            className="button primary"
                            onClick={() => newDraft()}
                            disabled={blocked}
                          >
                            New payout <ArrowRight size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </section>
                  <section className="panel evidence-panel">
                    <div
                      className="evidence-tabs"
                      role="tablist"
                      aria-label="Payment evidence"
                    >
                      <button
                        role="tab"
                        aria-selected={detail === "timeline"}
                        onClick={() => setDetail("timeline")}
                      >
                        <History size={16} />
                        Timeline <span>{snapshot?.events.length ?? 0}</span>
                      </button>
                      <button
                        role="tab"
                        aria-selected={detail === "ledger"}
                        onClick={() => setDetail("ledger")}
                      >
                        <Database size={16} />
                        Ledger{" "}
                        <span>{snapshot?.ledger?.entries.length ?? 0}</span>
                      </button>
                      <button
                        role="tab"
                        aria-selected={detail === "request"}
                        onClick={() => setDetail("request")}
                      >
                        <Code2 size={16} />
                        Requests
                      </button>
                    </div>
                    <div className="evidence-body" role="tabpanel">
                      {detail === "timeline" ? (
                        <Timeline snapshot={snapshot} />
                      ) : detail === "ledger" ? (
                        <LedgerView snapshot={snapshot} />
                      ) : (
                        <RequestView
                          trace={traces[0]}
                          requestKey={original?.key ?? requestKey}
                        />
                      )}
                    </div>
                  </section>
                </div>
                <aside className="insights-column">
                  <section className="panel ledger-summary">
                    <div className="summary-heading">
                      <Database size={17} />
                      <h3>Ledger</h3>
                      <span
                        className={`mini-dot ${snapshot?.ledger ? "green" : ""}`}
                      />
                    </div>
                    <p>{snapshot?.ledger ? "Posted" : "No entries posted"}</p>
                    <div className="balance-line">
                      <span>Debit</span>
                      <strong>
                        {snapshot?.ledger
                          ? money(
                              snapshot.ledger.amount,
                              snapshot.ledger.currency,
                            )
                          : "—"}
                      </strong>
                    </div>
                    <div className="balance-line">
                      <span>Credit</span>
                      <strong>
                        {snapshot?.ledger
                          ? money(
                              snapshot.ledger.amount,
                              snapshot.ledger.currency,
                            )
                          : "—"}
                      </strong>
                    </div>
                    {snapshot?.ledger && (
                      <div className="balanced">
                        <CheckCircle2 size={14} />
                        Balanced · difference{" "}
                        {money(0, snapshot.ledger.currency)}
                      </div>
                    )}
                    <button
                      className="text-link"
                      onClick={() => setDetail("ledger")}
                    >
                      View entries <ArrowRight size={14} />
                    </button>
                  </section>
                  {payout && (
                    <section className="panel duplicate-card">
                      <Fingerprint size={20} />
                      <h3>Idempotency</h3>
                      <p>Repeat the creation request with the same key.</p>
                      <button
                        className="button small full-width"
                        disabled={blocked || !original}
                        onClick={() => void replay()}
                      >
                        Replay request <RotateCcw size={14} />
                      </button>
                      {!original && (
                        <small>
                          Original request unavailable in this browser tab.
                        </small>
                      )}
                      <button
                        className="text-link muted"
                        disabled={blocked || !original}
                        onClick={() => void conflictingReplay()}
                      >
                        Test conflicting request <ArrowUpRight size={13} />
                      </button>
                    </section>
                  )}
                  {configuration?.automaticReconciliation && (
                    <div className="automatic-note">
                      <Zap size={16} />
                      <p>Automatic reconciliation enabled.</p>
                    </div>
                  )}
                </aside>
              </div>
            </>
          )}
        </div>
      </main>
      {(error || notice) && !expired && (
        <div
          className={`toast ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <span>
            {error ? <CircleHelp size={20} /> : <CheckCircle2 size={20} />}
          </span>
          <p>{error || notice}</p>
          <button
            aria-label="Dismiss message"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {historyOpen && (
        <div className="drawer-backdrop" onClick={() => setHistoryOpen(false)}>
          <section
            className="history-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Payout history"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-heading">
              <div>
                <h2>
                  Payout history <span>{payouts.total}</span>
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close history"
                onClick={() => setHistoryOpen(false)}
              >
                <X size={21} />
              </button>
            </div>
            {payouts.items.length ? (
              <div className="history-list">
                {payouts.items.map((item) => (
                  <button
                    key={item.id}
                    className="history-item"
                    onClick={() => void select(item.id)}
                  >
                    <span className="history-icon">
                      {item.provider === "mastercard" ? (
                        <Landmark size={19} />
                      ) : (
                        <Wallet size={19} />
                      )}
                    </span>
                    <span>
                      <strong>{money(item.amount, item.currency)}</strong>
                      <small>{item.recipientReference}</small>
                      <code>{shortId(item.id)}</code>
                    </span>
                    <span>
                      <StatusBadge status={item.status} />
                      <small>{time(item.createdAt)}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <History size={28} />
                <h3>No payouts yet</h3>
              </div>
            )}
            <div className="pagination">
              <button
                className="button small"
                disabled={payouts.page === 0}
                onClick={() =>
                  void engine
                    .list(payouts.page - 1)
                    .then(setPayouts)
                    .catch(fail)
                }
              >
                <ChevronLeft size={15} />
                Previous
              </button>
              <span>
                Page {payouts.page + 1} of{" "}
                {Math.max(1, Math.ceil(payouts.total / payouts.size))}
              </span>
              <button
                className="button small"
                disabled={(payouts.page + 1) * payouts.size >= payouts.total}
                onClick={() =>
                  void engine
                    .list(payouts.page + 1)
                    .then(setPayouts)
                    .catch(fail)
                }
              >
                Next
                <ChevronRight size={15} />
              </button>
            </div>
          </section>
        </div>
      )}
      {demoIntroOpen && !expired && !resetOpen && !historyOpen && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) dismissDemoIntro();
          }}
        >
          <section
            className="modal demo-intro"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-intro-title"
            aria-describedby="demo-intro-description"
          >
            <button
              className="icon-button modal-close"
              aria-label="Close demo notice"
              onClick={dismissDemoIntro}
            >
              <X size={19} />
            </button>
            <span className="modal-icon">
              <Clock3 size={24} />
            </span>
            <h2 id="demo-intro-title">Demo session</h2>
            <p id="demo-intro-description">
              Test funds only. Your records expire after{" "}
              {Math.ceil((workspace?.durationSeconds ?? 900) / 60)} minutes.
            </p>
            <div className="modal-actions">
              <button
                className="button primary"
                data-autofocus
                onClick={dismissDemoIntro}
              >
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </div>
      )}
      {(expired || resetOpen) && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-dialog-title"
          >
            <span className="modal-icon">
              <Clock3 size={26} />
            </span>
            <h2 id="workspace-dialog-title">
              {expired ? "Demo expired" : "Reset demo?"}
            </h2>
            <p>
              {expired
                ? "Your 15-minute demo has ended. Start a new session to continue."
                : "Clear this session’s payouts and start again? Mastercard sandbox transactions remain at the provider."}
            </p>
            <div className="modal-actions">
              {!expired && (
                <button className="button" onClick={() => setResetOpen(false)}>
                  Cancel
                </button>
              )}
              <button
                className="button primary"
                onClick={() => void reset()}
                disabled={!!busy}
              >
                {busy ? "Starting…" : expired ? "Start new demo" : "Reset"}
                <ArrowRight size={16} />
              </button>
            </div>
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function FlowNode({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div className={`flow-node ${tone}`}>
      <div className="node-icon">{icon}</div>
      <span className="node-label">{label}</span>
      <strong>{value}</strong>
      {sub && <small title={sub}>{sub}</small>}
    </div>
  );
}
function FlowArrow({
  active,
  uncertain = false,
}: {
  active: boolean;
  uncertain?: boolean;
}) {
  return (
    <div
      className={`flow-arrow ${active ? "active" : ""} ${uncertain ? "uncertain" : ""}`}
      aria-label={uncertain ? "Response uncertain" : "Payment flow"}
    >
      <span />
      <ArrowRight size={16} />
      {uncertain && <span className="lost-signal">?</span>}
    </div>
  );
}
