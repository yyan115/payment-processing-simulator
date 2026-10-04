import type { Outcome } from "../api/types";
import { money } from "../domain/money";
import { scenarios } from "../domain/scenarios";

export function ScenarioExplanation({
  scenario,
  from,
  to,
  amount,
}: {
  scenario: Outcome;
  from: string;
  to: string;
  amount: string;
}) {
  const paragraphs = scenarios
    .find((s) => s.id === scenario)
    ?.explanation({ from, to, amount: money(amount || "0", "SGD") });
  return (
    <div className="scenario-explanation">
      {paragraphs?.map((text, i) => (
        <p key={i}>{text}</p>
      ))}
    </div>
  );
}
