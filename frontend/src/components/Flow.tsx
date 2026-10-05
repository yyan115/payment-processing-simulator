import { LoaderCircle } from "lucide-react";
import type { Chip, Step } from "../domain/workflow";
export type FlowView = {
  platform?: Chip;
  network?: Chip;
  ledger?: Chip;
  current?: Step;
  step: number;
};
// Fold the steps so far into what each party currently shows.
export function viewOf(steps: Step[]): FlowView {
  const view: FlowView = { step: steps.length };
  for (const step of steps) {
    if (step.platform) view.platform = step.platform;
    if (step.network) view.network = step.network;
    if (step.ledger) view.ledger = step.ledger;
  }
  view.current = steps.at(-1);
  return view;
}
function Status({
  label,
  chip,
  empty,
}: {
  label: string;
  chip?: Chip;
  empty: string;
}) {
  return (
    <div className="party-row">
      <span className="party-label">{label}</span>
      <span className={`chip ${chip?.tone ?? "neutral"}`}>
        {chip?.text ?? empty}
      </span>
    </div>
  );
}
// Two parties with the latest message travelling between them. The motion is decorative
// and every state is also written as text.
export function Flow({
  view,
  network,
  working,
}: {
  view: FlowView;
  network: string;
  working: boolean;
}) {
  const arrow = view.current?.arrow;
  return (
    <div className="flow" role="group" aria-label="Payment flow">
      <div className="party">
        <strong>Payment platform</strong>
        <div className="party-rows">
          <Status label="Status" chip={view.platform} empty="Nothing yet" />
          <Status label="Ledger" chip={view.ledger} empty="Nothing posted" />
        </div>
      </div>
      <div className="channel" aria-hidden="true">
        <div
          key={view.step}
          className={`message ${arrow ? `${arrow.dir} ${arrow.lost ? "lost" : ""}` : "idle"}`}
        >
          {arrow && (
            <>
              <span className="message-label">
                {arrow.dir === "to-network"
                  ? `${arrow.label} →`
                  : `← ${arrow.label}`}
              </span>
              <span className="line" />
              <span className="packet" />
              {arrow.lost && <span className="cross">✕</span>}
            </>
          )}
          {!arrow && <span className="line" />}
        </div>
        {working && <LoaderCircle className="spin working" size={14} />}
      </div>
      <div className="party">
        <strong>{network}</strong>
        <div className="party-rows">
          <Status label="Record" chip={view.network} empty="Nothing yet" />
        </div>
      </div>
    </div>
  );
}
