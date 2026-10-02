import { describe, it, expect, vi } from "vitest";
import { runPayment } from "./workflow";
import type { Run } from "./workflow";
import type { Engine, Outcome, Snapshot } from "./model";
import type { Step } from "./workflow";
function fixture(scenario: Outcome) {
  let status: Snapshot["payout"]["status"] = "CREATED";
  let provider: Snapshot["provider"] = null;
  let sent = 0;
  const events: Snapshot["events"] = [];
  const attempts: Snapshot["attempts"] = [];
  const event = (eventType: string) =>
    events.push({
      id: `e${events.length}`,
      eventType,
      fromStatus: "PROCESSING",
      toStatus: status,
      createdAt: `2026-01-01T00:00:0${events.length}Z`,
    });
  const snapshot = (): Snapshot => ({
    payout: {
      id: "one",
      recipientReference: "John",
      amount: "100.00",
      currency: "SGD",
      provider: "simulated",
      status,
      providerReference: null,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    provider,
    ledger: null,
    events: [...events],
    attempts: [...attempts],
  });
  const engine = {
    create: vi.fn(async () => ({ created: false, payout: snapshot().payout })),
    snapshot: vi.fn(async () => snapshot()),
    configure: vi.fn(async () => {}),
    process: vi.fn(async () => {
      sent++;
      status =
        scenario === "SUCCESS"
          ? "SUCCEEDED"
          : scenario === "DECLINED"
            ? "FAILED"
            : "UNKNOWN";
      event(
        scenario === "SUCCESS"
          ? "PROVIDER_SUCCEEDED"
          : scenario === "DECLINED"
            ? "PROVIDER_DECLINED"
            : scenario === "PENDING"
              ? "PROVIDER_PENDING"
              : scenario === "UNKNOWN"
                ? "PROVIDER_UNKNOWN"
                : "PROVIDER_TIMEOUT",
      );
      provider =
        scenario === "TIMEOUT_BEFORE_PROCESSING"
          ? null
          : {
              providerReference: "provider-one",
              status:
                scenario === "PENDING"
                  ? "PENDING"
                  : scenario === "UNKNOWN"
                    ? "UNKNOWN"
                    : scenario === "DECLINED"
                      ? "DECLINED"
                      : "SUCCEEDED",
            };
    }),
    reconcile: vi.fn(async () => {
      if (provider?.status === "SUCCEEDED") status = "SUCCEEDED";
      attempts.push({
        id: `a${attempts.length}`,
        providerRecordFound: !!provider,
        providerStatus: provider?.status ?? null,
        outcome: "",
        createdAt: `2026-01-01T00:01:0${attempts.length}Z`,
      });
    }),
    retry: vi.fn(async () => {
      sent++;
      status = "SUCCEEDED";
      event("PROVIDER_RETRY_SUCCEEDED");
      provider = { providerReference: "provider-one", status: "SUCCEEDED" };
    }),
    advance: vi.fn(async () => {
      provider = { providerReference: "provider-one", status: "SUCCEEDED" };
    }),
    lookup: vi.fn(async () => ({ provider, checkedAt: "2026-01-01" })),
  } as unknown as Engine;
  const run: Run = {
    key: "original-key",
    scenario,
    sender: "Jane",
    intent: {
      recipientReference: "John",
      amount: "100.00",
      currency: "SGD",
      provider: "simulated",
    },
  };
  return {
    engine,
    run,
    sent: () => sent,
    setStatus: (s: typeof status) => {
      status = s;
    },
  };
}
// What a viewer reads for each scenario, in the order it happens.
const expected = {
  SUCCESS: {
    story: "The network approved the payment",
    final: "Result: SUCCEEDED",
  },
  DECLINED: {
    story: "The network declined the payment",
    final: "Result: FAILED",
  },
  TIMEOUT_AFTER_SUCCESS: {
    story: "its response was lost",
    final: "Result: SUCCEEDED",
  },
  TIMEOUT_BEFORE_PROCESSING: {
    story: "so no money moved and it is safe to send again",
    final: "Result: SUCCEEDED",
  },
  PENDING: {
    story: "still being processed",
    final: "Result: SUCCEEDED",
  },
  UNKNOWN: {
    story: "still cannot report a result",
    final: "Result: UNKNOWN",
  },
} as const;
describe("automatic payment workflow", () => {
  for (const [scenario, status] of [
    ["SUCCESS", "SUCCEEDED"],
    ["DECLINED", "FAILED"],
    ["TIMEOUT_AFTER_SUCCESS", "SUCCEEDED"],
    ["TIMEOUT_BEFORE_PROCESSING", "SUCCEEDED"],
    ["PENDING", "SUCCEEDED"],
    ["UNKNOWN", "UNKNOWN"],
  ] as const) {
    it(scenario, async () => {
      const f = fixture(scenario);
      const steps: Step[] = [];
      const result = await runPayment(f.engine, f.run, vi.fn(), (_, step) => {
        steps.push(step);
      });
      expect(result.payout.status).toBe(status);
      expect(f.run.complete).toBe(true);
      expect(f.engine.create).toHaveBeenNthCalledWith(
        2,
        "original-key",
        f.run.intent,
      );
      expect(steps.length).toBeGreaterThan(2);
      expect(steps.filter((step) => step.final)).toHaveLength(1);
      expect(steps.at(-1)?.final).toBe(true);
      expect(steps.at(-1)?.title).toBe(expected[scenario].final);
      expect(steps.map((step) => step.detail).join("\n")).toContain(
        expected[scenario].story,
      );
      expect(steps.some((step) => step.title === "Payment sent again")).toBe(
        scenario === "TIMEOUT_BEFORE_PROCESSING",
      );
      // Duplicate protection is always shown, and names the idempotency key.
      const duplicate = steps.find((s) => s.title === "Duplicate protection");
      expect(duplicate?.detail).toContain("idempotency key");
      if (scenario === "TIMEOUT_AFTER_SUCCESS")
        expect(f.engine.retry).not.toHaveBeenCalled();
      if (scenario === "UNKNOWN")
        expect(f.engine.advance).not.toHaveBeenCalled();
    });
  }
  it("preserves key and intent after a lost creation response", async () => {
    const f = fixture("SUCCESS");
    vi.mocked(f.engine.create).mockRejectedValueOnce(new Error("network"));
    await expect(runPayment(f.engine, f.run, vi.fn(), vi.fn())).rejects.toThrow(
      "network",
    );
    expect(f.engine.process).not.toHaveBeenCalled();
    await runPayment(f.engine, f.run, vi.fn(), vi.fn());
    expect(f.engine.create).toHaveBeenNthCalledWith(
      2,
      "original-key",
      f.run.intent,
    );
    expect(f.sent()).toBe(1);
  });
  it("never sends a terminal payment again when resuming", async () => {
    const f = fixture("SUCCESS");
    f.run.id = "one";
    f.setStatus("SUCCEEDED");
    await runPayment(f.engine, f.run, vi.fn(), vi.fn());
    expect(f.engine.process).not.toHaveBeenCalled();
    expect(f.engine.retry).not.toHaveBeenCalled();
  });
  it("does not mark a broken duplicate contract complete", async () => {
    const f = fixture("SUCCESS");
    vi.mocked(f.engine.create)
      .mockResolvedValueOnce({
        created: true,
        payout: (await f.engine.snapshot("one")).payout,
      })
      .mockResolvedValueOnce({
        created: true,
        payout: (await f.engine.snapshot("one")).payout,
      });
    await expect(runPayment(f.engine, f.run, vi.fn(), vi.fn())).rejects.toThrow(
      "Duplicate protection",
    );
    expect(f.run.complete).not.toBe(true);
  });
  it("keeps confirmed payment state and reports a failed Mastercard lookup", async () => {
    const f = fixture("SUCCESS");
    f.run.intent.provider = "mastercard";
    vi.mocked(f.engine.lookup).mockRejectedValue(new Error("Unavailable"));
    const progress = vi.fn();
    const result = await runPayment(f.engine, f.run, vi.fn(), progress);
    expect(result.payout.status).toBe("SUCCEEDED");
    expect(f.run.complete).toBe(true);
    expect(
      progress.mock.calls.some(([, step]) =>
        (step as Step).detail.includes("status lookup was unavailable"),
      ),
    ).toBe(true);
    expect(f.sent()).toBe(1);
  });
});

describe("what the diagram shows", () => {
  it("response lost: the network shows completed while the platform shows UNKNOWN", async () => {
    const f = fixture("TIMEOUT_AFTER_SUCCESS");
    const steps: Step[] = [];
    await runPayment(f.engine, f.run, vi.fn(), (_, step) => {
      steps.push(step);
    });
    const lost = steps.find((s) => s.title === "No response");
    expect(lost?.network?.text).toBe("Payment completed");
    expect(lost?.platform?.text).toBe("UNKNOWN");
    expect(lost?.arrow).toMatchObject({ dir: "to-platform", lost: true });
    expect(f.sent()).toBe(1);
  });
  it("request lost: the request itself is shown not arriving", async () => {
    const f = fixture("TIMEOUT_BEFORE_PROCESSING");
    const steps: Step[] = [];
    await runPayment(f.engine, f.run, vi.fn(), (_, step) => {
      steps.push(step);
    });
    expect(steps[0].arrow).toMatchObject({ dir: "to-network", lost: true });
    expect(steps[0].network?.text).toBe("No record");
    expect(steps.filter((s) => s.title === "Payment sent again")).toHaveLength(
      1,
    );
    expect(f.sent()).toBe(2);
  });
});
