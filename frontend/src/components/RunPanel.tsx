import { useEffect, useRef } from "react";
import type { Mode } from "../api/types";
import { networkNames } from "../domain/networks";
import type { Step } from "../domain/workflow";
import { Flow, viewOf } from "./Flow";

// The live trace of one payment: both parties, then each step as it happens.
export function RunPanel({
  title,
  mode,
  steps,
  busy,
  waiting,
  onNext,
}: {
  title: string;
  mode: Mode;
  steps: Step[];
  busy: boolean;
  waiting: boolean;
  onNext: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const end = useRef<HTMLDivElement>(null);
  // Bring a new run into view, then keep the newest step in view.
  useEffect(() => {
    if (steps.length === 1)
      panel.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    else
      end.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [steps.length, waiting]);

  return (
    <section className="run" aria-label="Payment progress" ref={panel}>
      <div className="flow-wrap">
        <h2>{title}</h2>
        <Flow
          view={viewOf(steps)}
          network={
            mode === "simulated" ? "Payment network" : networkNames[mode]
          }
          working={busy && !waiting}
        />
      </div>
      <ol className="timeline" aria-live="polite">
        {steps.map((step, i) => (
          <li
            key={i}
            className={`${step.final ? "final " : ""}${step.tone ?? "neutral"}`}
          >
            <strong>{step.title}</strong>
            <p>{step.detail}</p>
          </li>
        ))}
      </ol>
      {waiting && (
        <button type="button" className="next-step" onClick={onNext}>
          Next step
        </button>
      )}
      <div ref={end} className="scroll-end" />
    </section>
  );
}
