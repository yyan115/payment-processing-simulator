# Design Notes

## Core invariants

The project is built around several invariants:

1. A transport result is not automatically a payment result.
2. The same client intent must not create multiple local payouts.
3. A repeated external submission must not create duplicate financial impact.
4. A payout may be financially posted only after its outcome is known to be successful.
5. Every posted payout creates equal debit and credit ledger entries.
6. A payout is posted to the ledger at most once.

## Ambiguous outcomes

If an HTTP call times out, the application knows only that it did not receive the response. The provider may have never received the request or may already have completed the payout.

The local model therefore contains an explicit `UNKNOWN` state.

## Payout lifecycle

```text
CREATED -> PROCESSING -> SUCCEEDED
                    \-> FAILED
                    \-> UNKNOWN -> SUCCEEDED
                              \-> FAILED
                              \-> UNKNOWN
```

Invalid transitions are rejected by the `Payout` domain object.

## Idempotency

Every create request supplies an `Idempotency-Key`.

The service canonicalizes recipient reference, amount, and currency, then stores a SHA-256 request fingerprint with the key.

- same key + same fingerprint: return the existing payout
- same key + different fingerprint: reject with a conflict

A unique database constraint remains the final authority during concurrent requests.

## Provider repeats

Application-level idempotency and provider-level duplicate protection solve different problems.

`SubmissionMode.ORIGINAL` represents the first provider request. `SubmissionMode.RETRY` represents a deliberate repeat after an ambiguous outcome.

For a repeat, the simulated provider first checks the stable client reference:

- existing provider record: return it
- no provider record: process the transfer once

This mirrors the purpose of Mastercard Send's `repeat-flag`, documented for resending after no response or `UNKNOWN` status.

## Double-entry ledger

The ledger is append-only from the public API's perspective. There is no endpoint for mutating or deleting a journal entry.

A successful payout creates:

```text
DEBIT   SELLER_PAYABLE:<recipient>   amount currency
CREDIT  CASH_CLEARING                amount currency
```

Both lines belong to one `ledger_transaction`.

The unique `payout_id` constraint ensures one journal transaction per payout. The debit and credit amounts and currencies are created from the same immutable payout fields.

Ledger posting occurs inside the same Spring database transaction that transitions the payout to `SUCCEEDED`. If journal persistence fails, the success transition is rolled back too.

Unknown and failed payouts are deliberately absent from the ledger.

## Failure injection

Failure behavior is not an argument on the business processing endpoint.

The simulation-only API configures the next provider outcome separately. This keeps the payout interface shaped like a real payment service.

## Concurrency

Each payout row contains a JPA `@Version` field.

Two workers can read the same state, but they cannot both commit conflicting transitions against the same version. The loser sees either an invalid state or an optimistic-lock conflict.

## Reconciliation

Reconciliation queries the provider using the payout UUID as the stable client reference.

- provider reports `SUCCEEDED`: resolve to `SUCCEEDED` and post the ledger
- provider reports `DECLINED`: resolve to `FAILED`
- provider has no record: preserve `UNKNOWN`

Every reconciliation attempt is stored separately from the state-transition audit trail.

## Auditability

State changes produce immutable `payout_events` records containing payout ID, event type, previous state, new state, and timestamp.

## Observability

The application exposes low-cardinality payment metrics. A gauge tracks unresolved `UNKNOWN` payouts, and Prometheus includes an alert for ambiguous payouts that remain unresolved.

Application logs use payout IDs and provider references for correlation without logging recipient or payment details.

## Security boundary

Secrets are not part of simulator configuration.

A real Mastercard adapter will load credentials from external configuration and use Mastercard's official request-signing library. Private keys, consumer keys, PANs, and production payment data must never be committed to this repository.
