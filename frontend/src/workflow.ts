import type { Engine, Intent, Outcome, Snapshot } from "./model";
export type Run = {
  key: string;
  intent: Intent;
  scenario: Outcome;
  sender: string;
  id?: string;
  complete?: boolean;
};
export type Progress = (
  snapshot: Snapshot,
  message: string,
) => void | Promise<void>;
export async function runPayment(
  engine: Engine,
  run: Run,
  save: () => void,
  progress: Progress,
): Promise<Snapshot> {
  // Replaying creation after a lost HTTP response uses the exact original intent and key.
  const result = await engine.create(run.key, run.intent);
  run.id = result.payout.id;
  save();
  let snapshot = await engine.snapshot(run.id);
  await progress(snapshot, "Payment accepted.");
  if (snapshot.payout.status === "CREATED") {
    if (run.intent.provider === "simulated")
      await engine.configure(run.id, run.scenario);
    await engine.process(run.id);
    snapshot = await engine.snapshot(run.id);
    await progress(
      snapshot,
      snapshot.payout.status === "UNKNOWN"
        ? "Confirmation unavailable. Checking the payment provider…"
        : "Provider response received.",
    );
  }
  if (
    snapshot.payout.status === "UNKNOWN" ||
    snapshot.payout.status === "PROCESSING"
  ) {
    if (run.intent.provider === "simulated" && run.scenario === "PENDING") {
      // This is a controlled simulator transition, not a claim about an external provider.
      await engine.advance(run.id, "SUCCEEDED");
    }
    await engine.reconcile(run.id);
    snapshot = await engine.snapshot(run.id);
    await progress(
      snapshot,
      snapshot.payout.status === "UNKNOWN"
        ? "No final confirmation. Payment remains unresolved."
        : "Payment status confirmed by reconciliation.",
    );
    if (
      snapshot.payout.status === "UNKNOWN" &&
      run.intent.provider === "simulated" &&
      run.scenario === "TIMEOUT_BEFORE_PROCESSING" &&
      !snapshot.provider
    ) {
      await engine.retry(run.id);
      snapshot = await engine.snapshot(run.id);
      await progress(
        snapshot,
        "Repeated the payment with its original reference.",
      );
    }
  }
  // A duplicate creation request must return the same payment, without a second send.
  const replay = await engine.create(run.key, run.intent);
  if (replay.created || replay.payout.id !== run.id)
    throw new Error("Duplicate protection returned an unexpected payment.");
  snapshot = await engine.snapshot(run.id);
  let lookupUnavailable = false;
  if (run.intent.provider === "mastercard") {
    try {
      await engine.lookup(run.id);
    } catch {
      lookupUnavailable = true;
      await progress(
        snapshot,
        "Status lookup unavailable. The saved payment result is unchanged.",
      );
    }
  }
  await progress(
    snapshot,
    lookupUnavailable
      ? "Status lookup unavailable. The saved payment result is unchanged."
      : snapshot.payout.status === "PROCESSING"
        ? "Processing is still in progress. No final confirmation is available."
        : snapshot.payout.status === "UNKNOWN"
          ? "The provider still cannot confirm the result. No new payment was sent."
          : snapshot.payout.status === "FAILED"
            ? "Payment failed. No ledger entries posted."
            : snapshot.attempts.length
              ? "Recovered automatically. One payment confirmed, one journal posted."
              : "Payment confirmed. One journal posted.",
  );
  run.complete =
    snapshot.payout.status !== "CREATED" &&
    snapshot.payout.status !== "PROCESSING";
  save();
  return snapshot;
}
