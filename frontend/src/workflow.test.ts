import { describe, it, expect, vi } from "vitest";
import { runPayment } from "./workflow";
import type { Run } from "./workflow";
import type { Engine, Outcome, Snapshot } from "./model";
function fixture(scenario: Outcome) {
  let status: Snapshot["payout"]["status"] = "CREATED";
  let provider: Snapshot["provider"] = null;
  let sent = 0;
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
    events: [],
    attempts: [],
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
    }),
    retry: vi.fn(async () => {
      sent++;
      status = "SUCCEEDED";
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
      const updates: Snapshot[] = [];
      const result = await runPayment(f.engine, f.run, vi.fn(), (s) => {
        updates.push(s);
      });
      expect(result.payout.status).toBe(status);
      expect(f.run.complete).toBe(true);
      expect(f.engine.create).toHaveBeenNthCalledWith(
        2,
        "original-key",
        f.run.intent,
      );
      expect(updates.length).toBeGreaterThan(1);
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
});
