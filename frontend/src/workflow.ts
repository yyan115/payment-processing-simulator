import type {
  Engine,
  Intent,
  Outcome,
  ProviderStatus,
  Snapshot,
  Status,
} from "./model";
import { money } from "./model";
export type Run = {
  key: string;
  intent: Intent;
  scenario: Outcome;
  sender: string;
  id?: string;
  complete?: boolean;
};
export type Tone = "neutral" | "good" | "bad" | "warn";
export type Chip = { text: string; tone?: Tone };
// A message travelling between the two parties in the diagram.
export type Arrow = {
  dir: "to-network" | "to-platform";
  label: string;
  lost?: boolean;
};
// One step of the visible trace. The chips are the new state of each party after the step;
// a missing chip leaves that party unchanged.
export type Step = {
  title: string;
  detail: string;
  arrow?: Arrow;
  platform?: Chip;
  network?: Chip;
  ledger?: Chip;
  final?: boolean;
  tone?: Tone;
};
export type Progress = (
  snapshot: Snapshot | null,
  step: Step,
) => void | Promise<void>;

const statusTone: Record<Status, Tone> = {
  CREATED: "neutral",
  PROCESSING: "neutral",
  SUCCEEDED: "good",
  FAILED: "bad",
  UNKNOWN: "warn",
};
const platformChip = (snapshot: Snapshot): Chip => ({
  text: snapshot.payout.status,
  tone: statusTone[snapshot.payout.status],
});
const ledgerChip = (snapshot: Snapshot): Chip =>
  snapshot.ledger
    ? { text: "2 entries posted", tone: "good" }
    : { text: "No entries" };
// What the network's own records show about the payment.
const networkWords: Record<ProviderStatus, Chip> = {
  SUCCEEDED: { text: "Payment completed", tone: "good" },
  DECLINED: { text: "Payment refused", tone: "bad" },
  PENDING: { text: "Still processing", tone: "warn" },
  UNKNOWN: { text: "No result", tone: "warn" },
};
const noRecord: Chip = { text: "No record", tone: "neutral" };
function networkChip(status: ProviderStatus | null | undefined): Chip {
  return status ? networkWords[status] : noRecord;
}
const lastEvent = (snapshot: Snapshot) =>
  snapshot.events.at(-1)?.eventType.replace("PROVIDER_RETRY_", "PROVIDER_");
const requestNeverArrived = (snapshot: Snapshot, simulated: boolean) =>
  simulated &&
  snapshot.payout.status === "UNKNOWN" &&
  lastEvent(snapshot) === "PROVIDER_TIMEOUT" &&
  !snapshot.provider;

function sent(
  snapshot: Snapshot,
  run: Run,
  simulated: boolean,
  again: boolean,
): Step {
  const lost = requestNeverArrived(snapshot, simulated);
  const amount = money(run.intent.amount, run.intent.currency);
  return {
    title: again ? "Payment sent again" : "Payment sent",
    detail: again
      ? "The platform sends the payment again with the same reference, so the network can recognise it as the same payment and not pay twice."
      : `${run.sender} sends ${run.intent.recipientReference} ${amount}. The platform creates the payment with an idempotency key, which lets it recognise a repeated request, and sends it to the network.`,
    arrow: { dir: "to-network", label: "Payment request", lost },
    platform: { text: "PROCESSING", tone: "neutral" },
    network: lost ? noRecord : undefined,
  };
}
// The network's response, or the lack of one.
function response(snapshot: Snapshot, simulated: boolean): Step {
  const event = lastEvent(snapshot);
  const platform = platformChip(snapshot);
  const ledger = ledgerChip(snapshot);
  const network = simulated
    ? networkChip(snapshot.provider?.status)
    : undefined;
  switch (snapshot.payout.status) {
    case "SUCCEEDED":
      return {
        title: "Network approved",
        detail:
          "The network approved the payment and replied. The platform records it as SUCCEEDED and posts two matching entries to the ledger.",
        arrow: { dir: "to-platform", label: "Approved" },
        platform,
        ledger,
        network: simulated ? networkChip("SUCCEEDED") : undefined,
        tone: "good",
      };
    case "FAILED":
      return event === "PROVIDER_REJECTED"
        ? {
            title: "Request rejected",
            detail:
              "The network rejected the request as invalid. The platform records the payment as FAILED.",
            arrow: { dir: "to-platform", label: "Rejected" },
            platform,
            network,
            tone: "bad",
          }
        : {
            title: "Network declined",
            detail:
              "The network declined the payment and replied. The platform records it as FAILED and posts nothing to the ledger.",
            arrow: { dir: "to-platform", label: "Declined" },
            platform,
            network: simulated ? networkChip("DECLINED") : undefined,
            tone: "bad",
          };
    case "UNKNOWN":
      if (event === "PROVIDER_PENDING")
        return {
          title: "Still processing",
          detail:
            "The network replied that the payment is still being processed. A payment that is not finished is neither paid nor failed, so the platform records it as UNKNOWN.",
          arrow: { dir: "to-platform", label: "Pending" },
          platform,
          network,
          tone: "warn",
        };
      if (event === "PROVIDER_UNKNOWN")
        return {
          title: "No result",
          detail:
            "The network replied that it cannot report a result. The platform records the payment as UNKNOWN.",
          arrow: { dir: "to-platform", label: "No result" },
          platform,
          network,
          tone: "warn",
        };
      if (event === "PROVIDER_REJECTED")
        return {
          title: "Network error",
          detail:
            "The network returned an error, so the payment may or may not have been processed. The platform records it as UNKNOWN.",
          arrow: { dir: "to-platform", label: "Error" },
          platform,
          network,
          tone: "warn",
        };
      return requestNeverArrived(snapshot, simulated)
        ? {
            title: "No response",
            detail:
              "The request never reached the network, so no money moved. The platform cannot know that, because silence looks the same as a lost response. It records the payment as UNKNOWN.",
            platform,
            tone: "warn",
          }
        : {
            title: "No response",
            detail:
              "The network completed the payment, but its response was lost. With no response, the platform cannot tell whether the money moved, so it records the payment as UNKNOWN instead of guessing.",
            arrow: { dir: "to-platform", label: "Response lost", lost: true },
            platform,
            network,
            tone: "warn",
          };
    default:
      return {
        title: "Waiting",
        detail: "The payment is still being processed.",
        platform,
        tone: "warn",
      };
  }
}
function reconcileAsk(waits: boolean): Step {
  return {
    title: "Reconciliation",
    detail: `${waits ? "After a short wait, the" : "The"} platform reconciles: it asks the network for the status of the payment, using the payment's reference.`,
    arrow: { dir: "to-network", label: "Status query" },
  };
}
function reconcileAnswer(snapshot: Snapshot, willRepeat: boolean): Step {
  const attempt = [...snapshot.attempts]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  const found = !!attempt?.providerRecordFound;
  const status = attempt?.providerStatus;
  const network = networkChip(found ? status : null);
  const platform = platformChip(snapshot);
  switch (snapshot.payout.status) {
    case "SUCCEEDED":
      return {
        title: "Status confirmed",
        detail:
          "The network reports the payment as completed. The platform updates its record to SUCCEEDED and posts two matching entries to the ledger.",
        arrow: { dir: "to-platform", label: "Completed" },
        network,
        platform,
        ledger: ledgerChip(snapshot),
        tone: "good",
      };
    case "FAILED":
      return {
        title: "Status confirmed",
        detail:
          "The network reports the payment as refused. The platform records it as FAILED.",
        arrow: { dir: "to-platform", label: "Refused" },
        network,
        platform,
        tone: "bad",
      };
    case "UNKNOWN":
      if (!found)
        return {
          title: "No record found",
          detail: willRepeat
            ? "The network has no record of this payment, so no money moved and it is safe to send again."
            : "The network has no record of this payment. The status stays UNKNOWN.",
          arrow: { dir: "to-platform", label: "No record" },
          network,
          platform,
          tone: willRepeat ? "good" : "warn",
        };
      return {
        title: status === "PENDING" ? "Not finished" : "Still no result",
        detail:
          status === "PENDING"
            ? "The network has not finished processing the payment. The status stays UNKNOWN."
            : "The network still cannot report a result. The status stays UNKNOWN and the payment is not sent again.",
        arrow: {
          dir: "to-platform",
          label: status === "PENDING" ? "Pending" : "No result",
        },
        network,
        platform,
        tone: "warn",
      };
    default:
      return {
        title: "Not finished",
        detail: "The payment is still being processed.",
        network,
        platform,
        tone: "warn",
      };
  }
}
function finish(snapshot: Snapshot): Step {
  const detail = {
    SUCCEEDED:
      "The payment was made once, and the ledger holds two matching entries for it.",
    FAILED: "No money moved, so nothing was added to the ledger.",
    UNKNOWN:
      "The payment was not sent again. It stays UNKNOWN until someone confirms its status with the network.",
    PROCESSING:
      "The payment is still processing. There is no final result yet.",
    CREATED: "The payment has not been sent.",
  }[snapshot.payout.status];
  return {
    title: `Result: ${snapshot.payout.status}`,
    detail,
    platform: platformChip(snapshot),
    ledger: ledgerChip(snapshot),
    final: true,
    tone: statusTone[snapshot.payout.status],
  };
}
export async function runPayment(
  engine: Engine,
  run: Run,
  save: () => void,
  progress: Progress,
): Promise<Snapshot> {
  const simulated = run.intent.provider === "simulated";
  // Replaying creation after a lost HTTP response uses the exact original intent and key.
  const result = await engine.create(run.key, run.intent);
  run.id = result.payout.id;
  save();
  let snapshot = await engine.snapshot(run.id);
  if (snapshot.payout.status === "CREATED") {
    if (simulated) await engine.configure(run.id, run.scenario);
    await engine.process(run.id);
    snapshot = await engine.snapshot(run.id);
    await progress(snapshot, sent(snapshot, run, simulated, false));
    await progress(snapshot, response(snapshot, simulated));
  } else {
    await progress(snapshot, {
      title: "Resumed",
      detail:
        "This payment was already sent earlier, so it is not sent again. The platform continues from its saved status.",
      platform: platformChip(snapshot),
    });
  }
  if (
    snapshot.payout.status === "UNKNOWN" ||
    snapshot.payout.status === "PROCESSING"
  ) {
    const waits = simulated && run.scenario === "PENDING";
    await progress(snapshot, reconcileAsk(waits));
    // This is a controlled simulator transition, not a claim about an external provider.
    if (waits) await engine.advance(run.id, "SUCCEEDED");
    await engine.reconcile(run.id);
    snapshot = await engine.snapshot(run.id);
    const willRepeat =
      snapshot.payout.status === "UNKNOWN" &&
      simulated &&
      run.scenario === "TIMEOUT_BEFORE_PROCESSING" &&
      !snapshot.provider;
    await progress(snapshot, reconcileAnswer(snapshot, willRepeat));
    if (willRepeat) {
      await engine.retry(run.id);
      snapshot = await engine.snapshot(run.id);
      await progress(snapshot, sent(snapshot, run, simulated, true));
      await progress(snapshot, response(snapshot, simulated));
    }
  }
  // A duplicate creation request must return the same payment, without a second send.
  const replay = await engine.create(run.key, run.intent);
  if (replay.created || replay.payout.id !== run.id)
    throw new Error("Duplicate protection returned an unexpected payment.");
  snapshot = await engine.snapshot(run.id);
  await progress(snapshot, {
    title: "Duplicate protection",
    detail:
      "The original request is repeated with the same idempotency key. The platform returns the existing payment and creates no second one.",
  });
  if (run.intent.provider === "mastercard") {
    try {
      const lookup = await engine.lookup(run.id);
      await progress(snapshot, {
        title: "Status lookup",
        detail: `Mastercard reports the payment as ${lookup.provider?.status ?? "not found"}.`,
        arrow: { dir: "to-platform", label: "Status" },
        tone: lookup.provider?.status === "SUCCEEDED" ? "good" : "warn",
      });
    } catch {
      await progress(snapshot, {
        title: "Status lookup",
        detail:
          "The Mastercard status lookup was unavailable. The saved payment result is unchanged.",
        tone: "warn",
      });
    }
  }
  await progress(snapshot, finish(snapshot));
  run.complete =
    snapshot.payout.status !== "CREATED" &&
    snapshot.payout.status !== "PROCESSING";
  save();
  return snapshot;
}
