import { describe, expect, it } from "vitest";
import type { Snapshot } from "../api/types";
import { eventLines } from "./events";

const snapshot = (parts: Partial<Snapshot>) =>
  ({
    payout: {},
    provider: null,
    ledger: null,
    events: [],
    attempts: [],
    ...parts,
  }) as Snapshot;

describe("event lines", () => {
  it("interleaves events and unresolved checks by time", () => {
    const lines = eventLines(
      snapshot({
        events: [
          {
            id: "1",
            eventType: "PROVIDER_TIMEOUT",
            fromStatus: "PROCESSING",
            toStatus: "UNKNOWN",
            createdAt: "2026-10-03T10:00:00.100Z",
          },
          {
            id: "2",
            eventType: "PROVIDER_RETRY_SUCCEEDED",
            fromStatus: "UNKNOWN",
            toStatus: "SUCCEEDED",
            createdAt: "2026-10-03T10:00:02.000Z",
          },
        ],
        attempts: [
          {
            id: "a",
            providerRecordFound: false,
            providerStatus: null,
            outcome: "STILL_UNKNOWN",
            createdAt: "2026-10-03T10:00:01.000Z",
          },
        ],
      }),
    );
    expect(lines.map((l) => l.id)).toEqual(["event-1", "check-a", "event-2"]);
    expect(lines[1].text).toBe(
      "Checked with the network: it has no record of this payment",
    );
  });
  it("does not list a resolving check twice", () => {
    const lines = eventLines(
      snapshot({
        events: [
          {
            id: "1",
            eventType: "RECONCILIATION_SUCCEEDED",
            fromStatus: "UNKNOWN",
            toStatus: "SUCCEEDED",
            createdAt: "2026-10-03T10:00:00.000Z",
          },
        ],
        attempts: [
          {
            id: "a",
            providerRecordFound: true,
            providerStatus: "SUCCEEDED",
            outcome: "RESOLVED_SUCCEEDED",
            createdAt: "2026-10-03T10:00:00.000Z",
          },
        ],
      }),
    );
    expect(lines).toHaveLength(1);
  });
  it("compares times, not strings, so fractional seconds of different length sort correctly", () => {
    const lines = eventLines(
      snapshot({
        events: [
          {
            id: "1",
            eventType: "PROVIDER_TIMEOUT",
            fromStatus: "PROCESSING",
            toStatus: "UNKNOWN",
            createdAt: "2026-10-03T10:00:00.12Z",
          },
          {
            id: "2",
            eventType: "PROVIDER_RETRY_SUCCEEDED",
            fromStatus: "UNKNOWN",
            toStatus: "SUCCEEDED",
            createdAt: "2026-10-03T10:00:00.123456Z",
          },
        ],
      }),
    );
    expect(lines.map((l) => l.id)).toEqual(["event-1", "event-2"]);
  });
});
