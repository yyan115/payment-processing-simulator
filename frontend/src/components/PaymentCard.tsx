import { CircleHelp, LoaderCircle } from "lucide-react";
import type { Configuration, Mode } from "../api/types";
import { currencyFor } from "../domain/form";
import type { PaymentForm } from "../domain/form";
import { networkNames } from "../domain/networks";
import type { Playback } from "../domain/pace";
import { participants, recipientsFor } from "../domain/scenarios";

const playbackLabels: Record<Playback, string> = {
  auto: "Automatic",
  step: "Step by step",
};

// The payment form: amount, who pays whom, which network, and how the run is played back.
export function PaymentCard({
  form,
  config,
  disabled,
  busy,
  sendDisabled,
  playback,
  error,
  onSender,
  onRecipient,
  onAmount,
  onMode,
  onPlayback,
}: {
  form: PaymentForm;
  config: Configuration | null;
  disabled: boolean;
  busy: boolean;
  sendDisabled: boolean;
  playback: Playback;
  error: string;
  onSender: (sender: string) => void;
  onRecipient: (recipient: string) => void;
  onAmount: (amount: string) => void;
  onMode: (mode: Mode) => void;
  onPlayback: (playback: Playback) => void;
}) {
  const external = [
    { mode: "mastercard" as const, available: config?.mastercardAvailable },
    { mode: "visa" as const, available: config?.visaAvailable },
  ];
  return (
    <section className="card" aria-label="Payment workspace">
      <fieldset disabled={disabled}>
        <div className="amount">
          <label htmlFor="amount">You send</label>
          <div className="amount-field">
            <input
              id="amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => onAmount(e.target.value)}
              aria-label="Amount"
              required
            />
            <span className="currency">{currencyFor(form.mode)}</span>
          </div>
        </div>
        <div className="form-row">
          <label>
            From
            <select
              aria-label="From"
              value={form.sender}
              onChange={(e) => onSender(e.target.value)}
            >
              {participants.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            To
            <select
              aria-label="To"
              value={form.recipient}
              onChange={(e) => onRecipient(e.target.value)}
            >
              {recipientsFor(form.sender).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Payment network
          <select
            aria-label="Payment network"
            value={form.mode}
            onChange={(e) => onMode(e.target.value as Mode)}
          >
            <option value="simulated">{networkNames.simulated}</option>
            {external.map(({ mode, available }) => (
              <option key={mode} value={mode} disabled={!available}>
                {networkNames[mode]}
                {available ? "" : " (unavailable)"}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <div className="send-row">
        {form.mode === "simulated" && (
          <div className="playback" role="group" aria-label="Playback">
            <span>Playback</span>
            {(Object.keys(playbackLabels) as Playback[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={playback === value}
                onClick={() => onPlayback(value)}
              >
                {playbackLabels[value]}
              </button>
            ))}
            <div className="hint" tabIndex={0} aria-describedby="playback-hint">
              <CircleHelp size={16} aria-label="About playback" />
              <div role="tooltip" id="playback-hint">
                Automatic runs the steps by itself. Step by step waits for you
                to press Next step after each one.
              </div>
            </div>
          </div>
        )}
        <button className="send-button" type="submit" disabled={sendDisabled}>
          {busy ? (
            <>
              <LoaderCircle size={16} className="spin" /> Processing…
            </>
          ) : (
            "Send payment"
          )}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
