import type { Snapshot } from "../api/types";
import { eventText, networkStatusText } from "./format";

export type EventLine = {
  id: string;
  at: string;
  text: string;
  status: string | null;
};

// One list in the order things happened. Audit events say what the platform did, and each
// reconciliation attempt that found nothing new says what the network answered. A check that
// resolved the payment is already shown as its own event, so it is not listed twice.
export function eventLines(snapshot: Snapshot): EventLine[] {
  const events = snapshot.events.map((e) => ({
    id: `event-${e.id}`,
    at: e.createdAt,
    text:
      eventText[e.eventType] ?? e.eventType.replaceAll("_", " ").toLowerCase(),
    status: e.toStatus as string | null,
  }));
  const checks = snapshot.attempts
    .filter((a) => a.outcome === "STILL_UNKNOWN")
    .map((a) => ({
      id: `check-${a.id}`,
      at: a.createdAt,
      text: `Checked with the network: ${
        a.providerRecordFound && a.providerStatus
          ? networkStatusText[a.providerStatus]
          : "it has no record of this payment"
      }`,
      status: null as string | null,
    }));
  return [...events, ...checks].sort(
    (x, y) => Date.parse(x.at) - Date.parse(y.at),
  );
}
