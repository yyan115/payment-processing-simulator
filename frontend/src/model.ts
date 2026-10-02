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
export type Mode = "simulated" | "mastercard";
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
  temporaryWorkspaces: boolean;
};
export type Workspace = {
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
export const participants = ["Jane Tan", "John Lim", "Alex Morgan"] as const;
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
  explanation: (party: Party) => string;
};
export const scenarios: Scenario[] = [
  {
    id: "SUCCESS",
    name: "Approved payment",
    summary: "The network approves the payment.",
    explanation: ({ from, to, amount }) =>
      `${from} sends ${to} ${amount}. The payment platform creates the payment with a unique idempotency key, which lets it recognise a repeated request instead of creating a second payment, and sends it to the payment network. The network approves it, the platform records the payment as SUCCEEDED, and it posts two matching entries to the ledger, its double-entry accounting record.`,
  },
  {
    id: "DECLINED",
    name: "Declined payment",
    summary: "The network declines the payment.",
    explanation: ({ from, to, amount }) =>
      `${from} sends ${to} ${amount}, but the payment network declines it and says so in its response. The platform records the payment as FAILED. No money moved, so nothing is posted to the ledger.`,
  },
  {
    id: "TIMEOUT_AFTER_SUCCESS",
    name: "Response lost",
    summary: "The payment is made, but the response never arrives.",
    explanation: ({ from, to, amount }) =>
      `${from} sends ${to} ${amount}. The payment network completes the payment, but its response is lost on the way back. With no response, the platform cannot tell whether the money moved. Recording the payment as FAILED and sending it again could pay ${to} twice, so it records the payment as UNKNOWN instead. It then reconciles: it asks the network for the status of the payment, using the payment's reference, learns that it was completed, and records it as SUCCEEDED. The payment is never sent twice.`,
  },
  {
    id: "TIMEOUT_BEFORE_PROCESSING",
    name: "Request lost",
    summary: "The request never reaches the network.",
    explanation: ({ from, to, amount }) =>
      `${from} sends ${to} ${amount}, but the request is lost before it reaches the payment network, so no money moves. As in Response lost, the platform receives no response and records the payment as UNKNOWN. When it reconciles, the network has no record of the payment, which shows that it is safe to send it again. The platform resends it with the same reference, so that the network can recognise the payment if the first request does turn up later.`,
  },
  {
    id: "PENDING",
    name: "Pending payment",
    summary: "The network has not finished processing the payment.",
    explanation: ({ from, to, amount }) =>
      `${from} sends ${to} ${amount}. The payment network accepts the request but replies that the payment is still being processed. A payment that is not finished is neither paid nor failed, so the platform records it as UNKNOWN. It waits, reconciles with the network, and once the network reports the payment as approved it records it as SUCCEEDED and updates the ledger.`,
  },
  {
    id: "UNKNOWN",
    name: "Unknown outcome",
    summary: "The network cannot report a result.",
    explanation: ({ from, to, amount }) =>
      `${from} sends ${to} ${amount}. The payment network replies that it cannot give a result, and when the platform reconciles, the network still cannot say. Any result the platform recorded would be a guess, and a wrong guess means paying twice or not paying at all. The payment stays UNKNOWN and is not sent again until someone has confirmed its status with the network.`,
  },
];
