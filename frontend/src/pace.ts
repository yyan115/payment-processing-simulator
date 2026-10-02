import type { Mode } from "./model";
// Delay between visible steps, so a viewer can follow what the system does.
// Only the simulated network is staged; Mastercard shows its real timing.
export const defaultStepDelay = 1100;
export function stepDelay(provider: Mode): number {
  if (provider !== "simulated") return 0;
  try {
    const saved = localStorage.getItem("payment-simulator-pace");
    if (saved !== null && /^\d{1,4}$/.test(saved)) return Number(saved);
  } catch {
    /* Use the default when storage is unavailable. */
  }
  return defaultStepDelay;
}
export const sleep = (ms: number) =>
  ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : undefined;
