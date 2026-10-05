import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { ApiClient } from "./api/client";
import { ExpiredDialog } from "./components/ExpiredDialog";
import { Header } from "./components/Header";
import { History } from "./components/History";
import { Intro } from "./components/Intro";
import { LedgerSection } from "./components/LedgerSection";
import { PaymentCard } from "./components/PaymentCard";
import { RunPanel } from "./components/RunPanel";
import { ScenarioExplanation } from "./components/ScenarioExplanation";
import { ScenarioSection } from "./components/ScenarioSection";
import { initialForm, withMode, withSender } from "./domain/form";
import type { PaymentForm } from "./domain/form";
import { usePayment } from "./hooks/usePayment";
import { useTheme } from "./hooks/useTheme";
import { useWorkspace } from "./hooks/useWorkspace";

const api = new ApiClient();

export default function App() {
  const { theme, toggle } = useTheme();
  const [form, setForm] = useState<PaymentForm>(initialForm);
  const [verified, setVerified] = useState(false);
  const onVerified = useCallback((ready: boolean) => setVerified(ready), []);

  // The two hooks depend on each other. A new workspace clears the payment state, and a
  // reconnect waits for a payment in progress. They reach each other through this ref.
  const payment = useRef<ReturnType<typeof usePayment> | null>(null);
  const workspace = useWorkspace(api, {
    onReset: () => payment.current?.reset() ?? false,
    isBusy: () => payment.current?.isBusy() ?? false,
  });
  const run = usePayment(api, workspace);
  useEffect(() => {
    payment.current = run;
  });

  const { connection, config } = workspace;
  const ready = connection === "ready";
  const external = form.mode !== "simulated";

  return (
    <main className="page">
      <div className="hero">
        <Header connection={connection} theme={theme} onToggleTheme={toggle} />
        <div className="container hero-body">
          {!ready && (
            <div className="connection-notice">
              <LoaderCircle className="spin" size={18} />
              <div>
                <strong>Connecting to the payment server</strong>
                <p>
                  Free hosting may need time to start. We’re checking
                  automatically.
                </p>
              </div>
            </div>
          )}
          <form
            className="hero-grid"
            onSubmit={(event) => {
              event.preventDefault();
              run.send(form);
            }}
          >
            <div className="hero-copy">
              <Intro />
              <ScenarioSection
                mode={form.mode}
                scenario={form.scenario}
                disabled={run.busy || !ready}
                onScenario={(scenario) => setForm({ ...form, scenario })}
                onVerified={onVerified}
              />
            </div>
            {!external && (
              <ScenarioExplanation
                scenario={form.scenario}
                from={form.sender}
                to={form.recipient}
                amount={form.amount}
              />
            )}
            <PaymentCard
              form={form}
              config={config}
              disabled={run.busy || !ready}
              busy={run.busy}
              sendDisabled={run.busy || !ready || (external && !verified)}
              playback={run.playback}
              error={run.error}
              onSender={(sender) => setForm(withSender(form, sender))}
              onRecipient={(recipient) => setForm({ ...form, recipient })}
              onAmount={(amount) => setForm({ ...form, amount })}
              onMode={(mode) => setForm(withMode(form, mode))}
              onPlayback={run.changePlayback}
            />
          </form>
        </div>
      </div>
      <div className="container below">
        {run.steps.length > 0 && (
          <RunPanel
            title={run.trace.title}
            mode={run.trace.mode}
            steps={run.steps}
            busy={run.busy}
            waiting={run.waiting}
            onNext={run.next}
          />
        )}
        <div className="books">
          <History
            items={workspace.items}
            total={workspace.total}
            page={workspace.page}
            busy={run.busy}
            expanded={run.expanded}
            snapshots={run.snapshots}
            traceMap={run.traceMap}
            runFor={run.runFor}
            onInspect={(id) => void run.inspect(id)}
            onPage={(page) => void workspace.refresh(page)}
          />
          <LedgerSection
            accounts={workspace.accounts}
            postings={workspace.postings}
            paymentLabel={run.paymentLabel}
          />
        </div>
        <footer>
          <button
            disabled={run.busy || !ready}
            onClick={() => {
              if (window.confirm("Clear this demo’s history?"))
                void workspace.connect(true);
            }}
          >
            Clear history
          </button>
        </footer>
      </div>
      <ExpiredDialog
        expired={workspace.expired}
        onClose={() => workspace.setExpired(null)}
      />
    </main>
  );
}
