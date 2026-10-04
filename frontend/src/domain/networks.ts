import type { Mode } from "../api/types";

// How each payment network is named on the page.
export const networkNames: Record<Mode, string> = {
  simulated: "Simulated network",
  mastercard: "Mastercard API sandbox",
  visa: "Visa API sandbox",
};
// The API each external network is called through.
export const apiNames: Record<Exclude<Mode, "simulated">, string> = {
  mastercard: "Mastercard Send API",
  visa: "Visa Direct API",
};
