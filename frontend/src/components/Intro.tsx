export function Intro() {
  return (
    <div className="intro">
      <p>
        This simulator shows how a payment system and a payment network work
        together, using techniques that real payment systems use, such as
        idempotency keys and reconciliation.
      </p>
      <p>
        Every payment involves two parties. The payment platform takes the
        request and keeps the records. The payment network moves the money.
        Choose a scenario and send the payment to see how a real payment system
        handles it, step by step.
      </p>
    </div>
  );
}
