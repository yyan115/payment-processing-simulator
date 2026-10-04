import type { Mode, Outcome } from "../api/types";
import { participants, recipientAfterSenderChange } from "./scenarios";

export type PaymentForm = {
  sender: string;
  recipient: string;
  amount: string;
  mode: Mode;
  scenario: Outcome;
};

export const initialForm: PaymentForm = {
  sender: participants[0],
  recipient: participants[1],
  amount: "100.00",
  mode: "simulated",
  scenario: "TIMEOUT_AFTER_SUCCESS",
};

// A sender cannot pay themselves, so the recipient moves on when it would match.
export const withSender = (form: PaymentForm, sender: string): PaymentForm => ({
  ...form,
  sender,
  recipient: recipientAfterSenderChange(sender, form.recipient),
});

// The sandboxes use USD with a smaller default amount than the simulated network's SGD 100.
export const withMode = (form: PaymentForm, mode: Mode): PaymentForm => ({
  ...form,
  mode,
  amount: mode === "simulated" ? "100.00" : "50.00",
});

export const currencyFor = (mode: Mode) =>
  mode === "simulated" ? "SGD" : "USD";
