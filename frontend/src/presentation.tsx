export const labels: Record<string, string> = {
  CREATED: "Created",
  PROCESSING: "Processing",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  UNKNOWN: "Unknown",
  DECLINED: "Declined",
  PENDING: "Pending",
};
export const eventText: Record<string, string> = {
  PROCESSING_STARTED: "Processing started",
  PROVIDER_SUCCEEDED: "Provider confirmed success",
  PROVIDER_DECLINED: "Provider declined payout",
  PROVIDER_TIMEOUT: "Provider response unavailable",
  PROVIDER_PENDING: "Provider pending",
  PROVIDER_UNKNOWN: "Provider outcome unknown",
  PROVIDER_REJECTED: "Request rejected",
  PROVIDER_RETRY_SUCCEEDED: "Retry confirmed success",
  PROVIDER_RETRY_DECLINED: "Retry confirmed decline",
  PROVIDER_RETRY_TIMEOUT: "Retry response unavailable",
  PROVIDER_RETRY_REJECTED: "Retry rejected",
  PROVIDER_RETRY_PENDING: "Retry pending",
  PROVIDER_RETRY_UNKNOWN: "Retry outcome unknown",
  RECONCILIATION_SUCCEEDED: "Reconciliation confirmed success",
  RECONCILIATION_FAILED: "Reconciliation confirmed decline",
  RECONCILIATION_UNRESOLVED: "Reconciliation unresolved",
};
export const statusClass = (status?: string) =>
  status === "SUCCEEDED"
    ? "positive"
    : status === "FAILED" || status === "DECLINED"
      ? "negative"
      : status === "UNKNOWN" || status === "PENDING"
        ? "warning"
        : "neutral";
export const shortId = (id: string) => `${id.slice(0, 8)}…${id.slice(-4)}`;
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status ${statusClass(status)}`}>
      <span />
      {labels[status] ?? status}
    </span>
  );
}
export function time(value: string) {
  return new Date(value).toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
