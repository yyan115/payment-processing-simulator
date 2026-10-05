import { useEffect, useRef, useState } from "react";
type State = { required: boolean; siteKey: string; verified: boolean };
type Widget = {
  render: (node: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Widget;
  }
}
async function state(token?: string): Promise<State> {
  const response = await fetch("/api/v1/sandbox-verification", {
    method: token ? "POST" : "GET",
    headers: token ? { "Content-Type": "application/json" } : undefined,
    body: token ? JSON.stringify({ token }) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.message ?? "Verification unavailable.");
  return body;
}
export default function Verification({
  onReady,
}: {
  onReady: (ready: boolean) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<State | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    onReady(false);
    state()
      .then((s) => {
        if (!cancelled) {
          setStatus(s);
          onReady(s.verified);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load verification. Please retry.");
      });
    return () => {
      cancelled = true;
    };
  }, [retry, onReady]);
  useEffect(() => {
    if (!status?.required || status.verified) return;
    let cancelled = false,
      id: string | undefined,
      timer: ReturnType<typeof setTimeout>,
      attempts = 0;
    if (!document.querySelector("script[data-turnstile]")) {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.dataset.turnstile = "true";
      script.async = true;
      document.head.appendChild(script);
    }
    const mount = () => {
      if (cancelled) return;
      if (window.turnstile && node.current) {
        id = window.turnstile.render(node.current, {
          sitekey: status.siteKey,
          action: "sandbox",
          callback: (token: string) => {
            state(token)
              .then((s) => {
                if (!cancelled) {
                  setStatus(s);
                  onReady(s.verified);
                  setError("");
                }
              })
              .catch((e) => {
                if (!cancelled) {
                  setError(e.message);
                  onReady(false);
                }
              });
          },
          "error-callback": () => {
            setError("Verification could not complete. Please retry.");
            onReady(false);
          },
          "expired-callback": () => {
            onReady(false);
            setError("Verification expired. Please retry.");
          },
        });
      } else if (++attempts < 40) timer = setTimeout(mount, 250);
      else setError("Verification did not load. Please retry.");
    };
    mount();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (id) window.turnstile?.remove(id);
    };
  }, [status, retry, onReady]);
  return (
    <div className="verification">
      <div ref={node} />
      {status?.required && status.verified && (
        <p className="field-note">Session verified</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              setStatus(null);
              setRetry((r) => r + 1);
            }}
          >
            Retry verification
          </button>
        </p>
      )}
    </div>
  );
}
