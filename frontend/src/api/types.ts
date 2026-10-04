export type Status =
  "CREATED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
export type ProviderStatus = "SUCCEEDED" | "DECLINED" | "UNKNOWN" | "PENDING";
export type Outcome =
  | "SUCCESS"
  | "DECLINED"
  | "TIMEOUT_AFTER_SUCCESS"
  | "TIMEOUT_BEFORE_PROCESSING"
  | "PENDING"
  | "UNKNOWN";
export type Mode = "simulated" | "mastercard" | "visa";
export type Intent = {
  recipientReference: string;
  amount: string;
  currency: string;
  provider: Mode;
};
export type Payout = Omit<Intent, "amount"> & { amount: string | number } & {
  id: string;
  status: Status;
  providerReference: string | null;
  createdAt: string;
  updatedAt: string;
};
type Provider = { providerReference: string; status: ProviderStatus };
type Event = {
  id: string;
  eventType: string;
  fromStatus: Status;
  toStatus: Status;
  createdAt: string;
};
type Attempt = {
  id: string;
  providerRecordFound: boolean;
  providerStatus: ProviderStatus | null;
  outcome: string;
  createdAt: string;
};
type Entry = {
  id: string;
  accountCode: string;
  direction: "DEBIT" | "CREDIT";
  amount: string;
  currency: string;
  createdAt: string;
};
type Ledger = {
  id: string;
  payoutId: string;
  transactionType: string;
  amount: string;
  currency: string;
  createdAt: string;
  entries: Entry[];
};
export type LedgerAccount = {
  accountCode: string;
  currency: string;
  debits: string | number;
  credits: string | number;
  entries: number;
};
export type LedgerPosting = {
  id: string;
  payoutId: string;
  accountCode: string;
  direction: "DEBIT" | "CREDIT";
  amount: string | number;
  currency: string;
  createdAt: string;
};
export type Snapshot = {
  payout: Payout;
  provider: Provider | null;
  ledger: Ledger | null;
  events: Event[];
  attempts: Attempt[];
};
export type Page = {
  items: Payout[];
  total: number;
  page: number;
  size: number;
};
export type Configuration = {
  defaultProvider: Mode;
  automaticReconciliation: boolean;
  mastercardAvailable: boolean;
  visaAvailable: boolean;
  temporaryWorkspaces: boolean;
};
export type Workspace = {
  id: string | null;
  temporary: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  durationSeconds: number;
  maxPayouts: number;
};
export type ProviderObservation = {
  provider: Provider | null;
  checkedAt: string;
};
export type Trace = {
  method: string;
  path: string;
  status: number;
  duration: number;
  request: unknown;
  response: unknown;
  at: string;
  idempotencyKey?: string;
};
export interface PaymentApi {
  workspace(reset?: boolean): Promise<Workspace>;
  config(): Promise<Configuration>;
  lookup(id: string): Promise<ProviderObservation>;
  list(page?: number): Promise<Page>;
  ledgerAccounts(): Promise<LedgerAccount[]>;
  ledgerEntries(): Promise<LedgerPosting[]>;
  snapshot(id: string): Promise<Snapshot>;
  create(
    key: string,
    intent: Intent,
  ): Promise<{ payout: Payout; created: boolean }>;
  configure(id: string, outcome: Outcome): Promise<void>;
  process(id: string): Promise<void>;
  retry(id: string): Promise<void>;
  reconcile(id: string): Promise<void>;
  advance(id: string, status: ProviderStatus): Promise<void>;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    // True when the request may have reached the server but no answer came back.
    public retryable = false,
  ) {
    super(message);
  }
}
