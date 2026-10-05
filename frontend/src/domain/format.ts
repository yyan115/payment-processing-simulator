export const eventText: Record<string, string> = {
  PROCESSING_STARTED: "Payment sent to the network",
  PROVIDER_SUCCEEDED: "The network approved the payment",
  PROVIDER_DECLINED: "The network declined the payment",
  PROVIDER_TIMEOUT: "No response from the network",
  PROVIDER_PENDING: "The network is still processing the payment",
  PROVIDER_UNKNOWN: "The network could not give a result",
  PROVIDER_REJECTED: "The request was rejected",
  PROVIDER_RETRY_SUCCEEDED: "Payment sent again, and the network approved it",
  PROVIDER_RETRY_DECLINED: "Payment sent again, and the network declined it",
  PROVIDER_RETRY_TIMEOUT: "Payment sent again, with no response",
  PROVIDER_RETRY_REJECTED: "Payment sent again, and the request was rejected",
  PROVIDER_RETRY_PENDING: "Payment sent again, and it is still processing",
  PROVIDER_RETRY_UNKNOWN: "Payment sent again, and the network gave no result",
  RECONCILIATION_SUCCEEDED: "Checked with the network: the payment was made",
  RECONCILIATION_FAILED: "Checked with the network: the payment was refused",
  RECONCILIATION_UNRESOLVED: "Checked with the network: still no result",
};
export const networkStatusText = {
  SUCCEEDED: "the payment was made",
  DECLINED: "the payment was refused",
  PENDING: "it is still processing",
  UNKNOWN: "no result is available",
} as const;
export const shortId = (id: string) => `${id.slice(0, 8)}…${id.slice(-4)}`;
export function time(value: string) {
  return new Date(value).toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
