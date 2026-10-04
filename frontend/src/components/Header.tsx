import { Github, Moon, Sun } from "lucide-react";
import type { Connection } from "../hooks/useWorkspace";
import type { Theme } from "../hooks/useTheme";

const connectionText: Record<Connection, string> = {
  ready: "Connected",
  connecting: "Connecting…",
  unavailable: "Waiting for the server…",
};

export function Header({
  connection,
  theme,
  onToggleTheme,
}: {
  connection: Connection;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  return (
    <header className="topbar">
      <div className="container bar">
        <h1>Payment simulator</h1>
        <div className="header-tools">
          <div className="connection" role="status">
            <span className={`dot ${connection}`} />
            <span className="connection-text">
              {connectionText[connection]}
            </span>
          </div>
          <a
            href="https://github.com/yyan115/payment-processing-simulator"
            target="_blank"
            rel="noreferrer"
            aria-label="View source"
          >
            <Github size={18} />
          </a>
          <button
            type="button"
            aria-label={
              theme === "light"
                ? "Switch to dark theme"
                : "Switch to light theme"
            }
            onClick={onToggleTheme}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
