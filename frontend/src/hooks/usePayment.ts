import { useCallback, useEffect, useRef, useState } from "react";
import { observeRequests } from "../api/client";
import { ApiError } from "../api/types";
import type { Mode, PaymentApi, Snapshot, Trace } from "../api/types";
import type { PaymentForm } from "../domain/form";
import { currencyFor } from "../domain/form";
import { money, normalizeIntent } from "../domain/money";
import { savedPlayback, savePlayback, sleep, stepDelay } from "../domain/pace";
import type { Playback } from "../domain/pace";
import { scenarios } from "../domain/scenarios";
import { readSession, writeSession } from "../domain/storage";
import { runPayment } from "../domain/workflow";
import type { Run, Step } from "../domain/workflow";
import type { Workspace } from "./useWorkspace";

const RUNS_KEY = "payment-runs";
const TRACES_KEY = "payment-requests";
const MAX_TRACES_PER_PAYMENT = 30;
const MAX_ATTEMPTS = 3;

// Sending a payment and following it: the visible steps, playback, and what the browser knows
// about each payment (its run, its snapshot and the API requests it made).
export function usePayment(api: PaymentApi, workspace: Workspace) {
  const { connect, refresh, refreshLedger, setExpired, mounted } = workspace;
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [playback, setPlayback] = useState<Playback>(savedPlayback);
  const [waiting, setWaiting] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [trace, setTrace] = useState({ title: "", mode: "simulated" as Mode });
  const [traceMap, setTraceMap] = useState<Record<string, Trace[]>>(() =>
    readSession(TRACES_KEY, {}),
  );
  const runs = useRef<Record<string, Run>>(readSession(RUNS_KEY, {}));
  const playbackRef = useRef(playback);
  const release = useRef<(() => void) | null>(null);
  const active = useRef<Run | null>(null);
  const locked = useRef(false);

  const saveRuns = () => writeSession(RUNS_KEY, runs.current);
  const runFor = (id: string) =>
    Object.values(runs.current).find((run) => run.id === id);

  // Forget everything tied to the previous workspace. Returns whether it held any payments.
  const reset = useCallback(() => {
    const hadPayments = Object.keys(runs.current).length > 0;
    runs.current = {};
    writeSession(RUNS_KEY, runs.current);
    setSnapshots({});
    setSteps([]);
    setExpanded(null);
    setTraceMap({});
    writeSession(TRACES_KEY, {});
    return hadPayments;
  }, []);

  const changePlayback = (value: Playback) => {
    playbackRef.current = value;
    setPlayback(value);
    savePlayback(value);
    // Switching to automatic while a step is waiting lets the run carry on.
    if (value === "auto") release.current?.();
  };

  // Keep a copy of every API request, keyed by the payment it belongs to.
  useEffect(
    () =>
      observeRequests((request) => {
        const responseId = (request.response as { id?: string } | null)?.id;
        const id =
          active.current?.key ??
          responseId ??
          request.path.match(/\/payouts\/([^/]+)/)?.[1];
        if (!id) return;
        setTraceMap((previous) => {
          const next = {
            ...previous,
            [id]: [...(previous[id] ?? []), request].slice(
              -MAX_TRACES_PER_PAYMENT,
            ),
          };
          writeSession(TRACES_KEY, next);
          return next;
        });
      }),
    [],
  );

  // Shows one step, then waits: for Next step, or for the pause that makes the run easy to follow.
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
    // Stepping only suits the simulated network. The real sandboxes have already answered
    // by the time their steps are shown.
    const provider = active.current?.intent.provider ?? "simulated";
    if (playbackRef.current === "step" && provider === "simulated") {
      setWaiting(true);
      await new Promise<void>((resolve) => {
        release.current = resolve;
      });
      release.current = null;
      if (mounted.current) setWaiting(false);
    } else {
      await sleep(stepDelay(provider));
    }
  };

  const execute = async (run: Run) => {
    if (locked.current) return;
    locked.current = true;
    active.current = run;
    setBusy(true);
    setError("");
    const scenario = scenarios.find((s) => s.id === run.scenario)?.name;
    setTrace({
      title: `${run.sender} → ${run.intent.recipientReference} · ${money(run.intent.amount, run.intent.currency)}${
        run.intent.provider === "simulated" ? ` · ${scenario}` : ""
      }`,
      mode: run.intent.provider,
    });
    try {
      // A lost reply is retried automatically with the same idempotency key, so it can never
      // create a second payment.
      for (let attempt = 1; ; attempt++) {
        try {
          await runPayment(api, run, saveRuns, progress);
          break;
        } catch (failure) {
          const retryable = failure instanceof ApiError && failure.retryable;
          if (!retryable || attempt >= MAX_ATTEMPTS || !mounted.current)
            throw failure;
          await sleep(1000 * attempt);
        }
      }
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
      // Never create a fresh payment automatically after an ambiguous network result.
      if (run.id) {
        try {
          const saved = await api.snapshot(run.id);
          setSnapshots((previous) => ({
            ...previous,
            [saved.payout.id]: saved,
          }));
          await refresh();
        } catch {
          /* The history shows the server's state the next time it loads. */
        }
      }
    } finally {
      active.current = null;
      locked.current = false;
      setWaiting(false);
      setBusy(false);
    }
  };

  const send = (form: PaymentForm) => {
    try {
      const run: Run = {
        key: `demo-${crypto.randomUUID()}`,
        intent: normalizeIntent({
          recipientReference: form.recipient,
          amount: form.amount,
          currency: currencyFor(form.mode),
          provider: form.mode,
        }),
        scenario: form.scenario,
        sender: form.sender,
      };
      runs.current[run.key] = run;
      saveRuns();
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

  // Opens or closes a history row and loads that payment's current state.
  const inspect = async (id: string) => {
    setExpanded((current) => (current === id ? null : id));
    try {
      const snapshot = await api.snapshot(id);
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

  // Names a payment in the ledger, using what this browser knows about it.
  const paymentLabel = (id: string) => {
    const payment = workspace.items.find((item) => item.id === id);
    if (!payment) return `Payment ${id.slice(0, 8)}`;
    const run = runFor(id);
    return `${run?.sender ? `${run.sender} → ` : ""}${payment.recipientReference}`;
  };

  return {
    steps,
    trace,
    busy,
    waiting,
    error,
    playback,
    snapshots,
    expanded,
    traceMap,
    changePlayback,
    send,
    inspect,
    next: () => release.current?.(),
    runFor,
    paymentLabel,
    reset,
    isBusy: () => locked.current,
  };
}
