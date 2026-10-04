import { useEffect, useRef } from "react";
import type { Expired } from "../hooks/useWorkspace";

export function ExpiredDialog({
  expired,
  onClose,
}: {
  expired: Expired;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (expired && element && !element.open) element.showModal?.();
  }, [expired]);
  if (!expired) return null;
  return (
    <dialog
      ref={dialog}
      className="expired"
      aria-labelledby="expired-title"
      onCancel={(event) => event.preventDefault()}
    >
      <h2 id="expired-title">Session expired</h2>
      <p>
        This page was inactive for too long, so its payments and ledger were
        cleared.
        {expired.action ? " Your last action was not carried out." : ""}
      </p>
      <button type="button" autoFocus onClick={onClose}>
        OK
      </button>
    </dialog>
  );
}
