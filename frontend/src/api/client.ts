import { ApiError } from "./types";
import type {
  Configuration,
  PaymentApi,
  Intent,
  LedgerAccount,
  LedgerPosting,
  Outcome,
  Page,
  Payout,
  ProviderObservation,
  ProviderStatus,
  Snapshot,
  Trace,
  Workspace,
} from "./types";

// Each tab keeps its own workspace id, so two tabs never share a workspace.
const idKey = "payment-simulator-workspace";
function savedId(): string | null {
  try {
    return sessionStorage.getItem(idKey);
  } catch {
    return null;
  }
}
let workspaceId: string | null = savedId();
function rememberId(id: string | null) {
  workspaceId = id;
  try {
    if (id) sessionStorage.setItem(idKey, id);
    else sessionStorage.removeItem(idKey);
  } catch {
    /* The id only lasts for this page load when storage is unavailable. */
  }
}
let report: ((trace: Trace) => void) | undefined;
export function observeRequests(listener: (trace: Trace) => void) {
  report = listener;
  return () => {
    report = undefined;
  };
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ data: T; status: number }> {
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        // A tab with no workspace yet sends "new", so the server never falls back to the
        // browser cookie, which belongs to whichever tab opened a workspace last.
        "X-Workspace-Id": workspaceId ?? "new",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    if (method !== "GET" && !path.startsWith("/workspace"))
      report?.({
        method,
        path: `/api/v1${path}`,
        status: 0,
        duration: Math.round(performance.now() - started),
        request: body ?? null,
        response: null,
        at: new Date().toISOString(),
        idempotencyKey: headers?.["Idempotency-Key"],
      });
    throw new ApiError(
      "No server response. The request may have completed; check the payout before retrying.",
      503,
      true,
    );
  }
  const data =
    response.status === 204
      ? undefined
      : await response.json().catch(() => null);
  if (
    (method !== "GET" || path.endsWith("/provider")) &&
    !path.startsWith("/workspace")
  )
    report?.({
      method,
      path: `/api/v1${path}`,
      status: response.status,
      duration: Math.round(performance.now() - started),
      request: body ?? null,
      response: data ?? null,
      at: new Date().toISOString(),
      idempotencyKey: headers?.["Idempotency-Key"],
    });
  if (!response.ok)
    throw new ApiError(
      data?.message ?? `The backend returned HTTP ${response.status}.`,
      response.status,
    );
  if (data === null && response.status !== 204)
    throw new ApiError("Unexpected server response. Try reconnecting.", 502);
  return { data, status: response.status };
}
export class ApiClient implements PaymentApi {
  async workspace(reset = false) {
    const workspace = (
      await request<Workspace>(`/workspace?reset=${reset}`, "POST")
    ).data;
    rememberId(workspace.id);
    return workspace;
  }
  async config() {
    return (await request<Configuration>("/config")).data;
  }
  async list(page = 0) {
    return (await request<Page>(`/payouts?page=${page}&size=20`)).data;
  }
  async ledgerAccounts() {
    return (await request<LedgerAccount[]>("/ledger/accounts")).data;
  }
  async ledgerEntries() {
    return (await request<LedgerPosting[]>("/ledger/entries")).data;
  }
  async snapshot(id: string) {
    return (await request<Snapshot>(`/payouts/${id}/snapshot`)).data;
  }
  async lookup(id: string) {
    return (await request<ProviderObservation>(`/payouts/${id}/provider`)).data;
  }
  async create(key: string, intent: Intent) {
    const result = await request<Payout>("/payouts", "POST", intent, {
      "Idempotency-Key": key,
    });
    return { payout: result.data, created: result.status === 201 };
  }
  async configure(id: string, outcome: Outcome) {
    await request(`/simulation/payouts/${id}/next-outcome`, "PUT", { outcome });
  }
  async process(id: string) {
    await request(`/payouts/${id}/process`, "POST");
  }
  async retry(id: string) {
    await request(`/payouts/${id}/retry`, "POST");
  }
  async reconcile(id: string) {
    await request(`/payouts/${id}/reconcile`, "POST");
  }
  async advance(id: string, status: ProviderStatus) {
    await request(`/simulation/payouts/${id}/provider-status`, "PUT", {
      status,
    });
  }
}
