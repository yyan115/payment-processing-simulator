import type { Mode, Outcome } from "../api/types";
import { apiNames, networkNames } from "../domain/networks";
import { scenarios } from "../domain/scenarios";
import Verification from "./Verification";

// The simulated network offers six scenarios. The sandboxes have none, so they get a note instead.
export function ScenarioSection({
  mode,
  scenario,
  disabled,
  onScenario,
  onVerified,
}: {
  mode: Mode;
  scenario: Outcome;
  disabled: boolean;
  onScenario: (scenario: Outcome) => void;
  onVerified: (ready: boolean) => void;
}) {
  return (
    <fieldset disabled={disabled}>
      {mode === "simulated" ? (
        <div
          className="scenarios"
          role="radiogroup"
          aria-labelledby="scenario-label"
        >
          <h2 className="section-label" id="scenario-label">
            Scenario
          </h2>
          {scenarios.map((s) => {
            const on = scenario === s.id;
            return (
              <div key={s.id} className={on ? "option on" : "option"}>
                <label>
                  <input
                    type="radio"
                    name="scenario"
                    value={s.id}
                    checked={on}
                    onChange={() => onScenario(s.id)}
                    aria-labelledby={`${s.id}-name`}
                    aria-describedby={`${s.id}-summary`}
                  />
                  <span>
                    <span className="option-name" id={`${s.id}-name`}>
                      {s.name}
                    </span>
                    <span className="option-summary" id={`${s.id}-summary`}>
                      {s.summary}
                    </span>
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <p className="field-note">
            This sends a request to the official {networkNames[mode]} using the{" "}
            {apiNames[mode]}, within{" "}
            {mode === "visa" ? "Visa’s" : "Mastercard’s"} test environment.
          </p>
          <Verification onReady={onVerified} />
        </>
      )}
    </fieldset>
  );
}
