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
// Names of the external sandboxes, as shown to visitors.
export const networkNames: Record<Mode, string> = {
  simulated: "Simulated network",
  mastercard: "Mastercard API sandbox",
  visa: "Visa API sandbox",
};
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
export type Provider = { providerReference: string; status: ProviderStatus };
export type Event = {
  id: string;
  eventType: string;
  fromStatus: Status;
  toStatus: Status;
  createdAt: string;
};
export type Attempt = {
  id: string;
  providerRecordFound: boolean;
  providerStatus: ProviderStatus | null;
  outcome: string;
  createdAt: string;
};
export type Entry = {
  id: string;
  accountCode: string;
  direction: "DEBIT" | "CREDIT";
  amount: string;
  currency: string;
  createdAt: string;
};
export type Ledger = {
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
export interface Engine {
  workspace(reset?: boolean): Promise<Workspace>;
  config(): Promise<Configuration>;
  lookup(id: string): Promise<ProviderObservation>;
  list(page?: number): Promise<Page>;
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
export const currencies: Record<string, number> = {
  SGD: 2,
  USD: 2,
  EUR: 2,
  JPY: 0,
  KWD: 3,
};

// Convert from decimal text, never by multiplying a binary floating-point amount.
export function minorUnits(amount: string, currency: string): bigint {
  const digits = currencies[currency];
  if (digits === undefined)
    throw new ApiError("Choose a supported demo currency.");
  if (!/^\d+(\.\d+)?$/.test(amount))
    throw new ApiError("Enter a positive amount, for example 100.00.");
  const [whole, rawFraction = ""] = amount.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  if (fraction.length > digits)
    throw new ApiError(
      `${currency} supports at most ${digits} decimal places.`,
    );
  const units =
    BigInt(whole) * 10n ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, "0") || "0");
  if (units <= 0n || units > 1000000n * 10n ** BigInt(digits))
    throw new ApiError(
      "Use an amount greater than 0 and at most 1,000,000 for this demo.",
    );
  return units;
}
export function normalizeIntent(intent: Intent): Intent {
  const currency = intent.currency.toUpperCase();
  const units = minorUnits(intent.amount.trim(), currency);
  const digits = currencies[currency];
  const text = units.toString().padStart(digits + 1, "0");
  const recipientReference = intent.recipientReference.trim();
  if (!recipientReference || recipientReference.length > 255)
    throw new ApiError("Recipient reference must contain 1–255 characters.");
  return {
    recipientReference,
    currency,
    provider: intent.provider,
    amount: digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text,
  };
}
export function money(amount: string | number, currency: string) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(Number(amount));
}
export const participants = ["Sarah Lim", "Daniel Wong", "Rachel Koh"] as const;
export const recipientsFor = (sender: string) =>
  participants.filter((name) => name !== sender);
// Keep the current recipient unless it just became the sender.
export const recipientAfterSenderChange = (
  sender: string,
  recipient: string,
) => (recipient === sender ? recipientsFor(sender)[0] : recipient);

export type Party = { from: string; to: string; amount: string };
export type Scenario = {
  id: Outcome;
  name: string;
  summary: string;
  // Plain paragraphs, shown in order under the selected scenario.
  explanation: (party: Party) => string[];
};
export const scenarios: Scenario[] = [
  {
    id: "SUCCESS",
    name: "Approved payment",
    summary: "The network approves the payment.",
    explanation: ({ from, to, amount }) => [
      `${from} sends ${to} ${amount}. The platform passes the payment to the network and the network approves it.`,
      `The platform records SUCCEEDED and posts a journal entry to the ledger. This is the expected outcome.`,
    ],
  },
  {
    id: "DECLINED",
    name: "Declined payment",
    summary: "The network declines the payment.",
    explanation: ({ from, to, amount }) => [
      `${from} sends ${to} ${amount} and the network declines it. A decline is final, so no money is transferred. This happens for reasons such as insufficient funds.`,
      `The platform records FAILED and posts nothing to the ledger.`,
    ],
  },
  {
    id: "TIMEOUT_AFTER_SUCCESS",
    name: "Response lost",
    summary: "The payment is made, but the response never arrives.",
    explanation: ({ from, to, amount }) => [
      `${from} sends ${to} ${amount}. The network approves it and moves the money, but its reply never arrives, so the platform cannot tell if the payment happened.`,
      `It records UNKNOWN and does not send again, because ${to} could be paid twice. Instead it reconciles, asking the network what happened to this payment using its reference ID.`,
      `In this scenario the network answers that it was approved, so the platform records SUCCEEDED.`,
    ],
  },
  {
    id: "TIMEOUT_BEFORE_PROCESSING",
    name: "Request lost",
    summary: "The request never reaches the network.",
    explanation: ({ from, to, amount }) => [
      `${from} sends ${to} ${amount}, but the request is lost before it reaches the network, so no money is transferred. The platform gets no reply and records UNKNOWN.`,
      `It then asks the network about the payment using its reference ID. The network has no record of it, so the platform knows nothing was paid.`,
      `The platform sends the request again with the same reference ID, so the network treats it as the same payment.`,
    ],
  },
  {
    id: "PENDING",
    name: "Pending payment",
    summary: "The network has not finished processing the payment.",
    explanation: ({ from, to, amount }) => [
      `${from} sends ${to} ${amount}. The network accepts the request but replies that the payment is still being processed.`,
      `The platform cannot record SUCCEEDED or FAILED yet, because a wrong guess means a lost payment or a double payment. It records UNKNOWN, waits briefly and checks again.`,
      `In this scenario the network then reports approval and the platform records SUCCEEDED. A decline would be recorded as FAILED.`,
    ],
  },
  {
    id: "UNKNOWN",
    name: "Unknown outcome",
    summary: "The network cannot report a result.",
    explanation: ({ from, to, amount }) => [
      `${from} sends ${to} ${amount}. The network cannot report a result, and still cannot when the platform checks again.`,
      `The platform cannot tell whether the payment happened, and guessing wrong means paying twice or never paying. So it keeps the payment as UNKNOWN, posts nothing to the ledger and does not send it again.`,
      `In this scenario the network never reports a result, so the payment stays UNKNOWN. A real network's settlement report, a list of every payment it processed, would settle it.`,
    ],
  },
];
