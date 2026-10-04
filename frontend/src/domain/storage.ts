// Per-tab state lives in sessionStorage. The server stays authoritative when storage is unavailable.
export function readSession<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Nothing to do: the server holds the real records. */
  }
}
