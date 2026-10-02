import type { Mode } from "./model";
// Delay between visible steps, so a viewer can follow what the system does.
// Only the simulated network is staged; the external sandboxes show their real timing.
export const defaultStepDelay = 2000;
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
// Automatic plays each step after a pause. Step by step waits for the viewer.
export type Playback = "auto" | "step";
export function savedPlayback(): Playback {
  try {
    return localStorage.getItem("payment-simulator-playback") === "step"
      ? "step"
      : "auto";
  } catch {
    return "auto";
  }
}
export function savePlayback(value: Playback) {
  try {
    localStorage.setItem("payment-simulator-playback", value);
  } catch {
    /* The choice only lasts for this page when storage is unavailable. */
  }
}
