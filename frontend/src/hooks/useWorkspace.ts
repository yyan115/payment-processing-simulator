import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Configuration,
  LedgerAccount,
  LedgerPosting,
  PaymentApi,
  Payout,
} from "../api/types";
import { readSession, writeSession } from "../domain/storage";

export type Connection = "connecting" | "ready" | "unavailable";
export type Expired = { action: boolean } | null;

type Hooks = {
  // Clears everything tied to the old workspace. Returns whether it held any payments.
  onReset: () => boolean;
  // True while a payment is being sent, so a reconnect does not interrupt it.
  isBusy: () => boolean;
};

// The browser's tab-sized workspace, with the connection state, the payment list and the ledger.
export function useWorkspace(api: PaymentApi, hooks: Hooks) {
  const [config, setConfig] = useState<Configuration | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [items, setItems] = useState<Payout[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [postings, setPostings] = useState<LedgerPosting[]>([]);
  const [expired, setExpired] = useState<Expired>(null);
  const mounted = useRef(true);
  const pending = useRef<Promise<boolean> | null>(null);
  const latest = useRef(hooks);
  latest.current = hooks;

  const refresh = useCallback(
    async (listPage = 0) => {
      const list = await api.list(listPage);
      if (mounted.current) {
        setItems(list.items);
        setTotal(list.total);
        setPage(list.page);
      }
    },
    [api],
  );

  const refreshLedger = useCallback(async () => {
    try {
      const [list, lines] = await Promise.all([
        api.ledgerAccounts(),
        api.ledgerEntries(),
      ]);
      if (mounted.current) {
        setAccounts(list);
        setPostings(lines);
      }
    } catch {
      /* The totals are reloaded after the next payment. */
    }
  }, [api]);

  // Opens a workspace (a new one when reset is true) and loads its state. Calls in flight are shared.
  const connect = useCallback(
    (reset = false): Promise<boolean> => {
      if (pending.current) return pending.current;
      const task = (async () => {
        try {
          const workspace = await api.workspace(reset);
          // The start time identifies the session and does not change while it is in use.
          const identity = workspace.startedAt ?? "persistent";
          const known = readSession<string | null>("workspace-identity", null);
          if (reset || (known && known !== identity)) {
            // Only tell the visitor when there was something to lose.
            const hadPayments = latest.current.onReset();
            if (!reset && hadPayments) setExpired({ action: false });
          }
          writeSession("workspace-identity", identity);
          const configuration = await api.config();
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
          pending.current = null;
        }
      })();
      pending.current = task;
      return task;
    },
    [api, refresh, refreshLedger],
  );

  // Open a fresh workspace on load, retrying with a growing delay until the server answers.
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      if (cancelled) return;
      const ok = await connect(true);
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

  // While the server is unreachable, keep trying in the background.
  useEffect(() => {
    if (connection !== "unavailable") return;
    const timer = setInterval(() => {
      if (!latest.current.isBusy()) void connect();
    }, 10000);
    return () => clearInterval(timer);
  }, [connection, connect]);

  return {
    config,
    connection,
    items,
    total,
    page,
    accounts,
    postings,
    expired,
    setExpired,
    mounted,
    refresh,
    refreshLedger,
    connect,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
