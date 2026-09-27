# Design Notes

## Core invariants

The project is built around several invariants:

1. A transport result is not automatically a payment result.
2. The same client intent must not create multiple local payouts.
3. A repeated external submission must not create duplicate financial impact.
4. A payout may be financially posted only after its outcome is known to be successful.
5. Every posted payout creates equal debit and credit ledger entries.
6. A payout is posted to the ledger at most once.
7. Concurrent workers cannot create duplicate provider or ledger transactions.
8. A provider success cannot be lost merely because the local finalization write fails.
9. A confirmed financial event is never rewritten to represent a later reversal; reversals require compensating financial events.

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

## Money representation

The REST API and ledger store positive amounts in major currency units as `BigDecimal`. Currency codes are validated against ISO 4217, and amounts cannot contain more fractional digits than the currency supports. The minimum representable amount therefore follows the currency exponent rather than assuming a two-decimal currency: KWD can accept `0.001`, while JPY accepts whole units only.

Provider adapters are responsible for their wire representation. Mastercard Send expects amounts in the currency's smallest unit, so the adapter converts using the ISO currency exponent without rounding.

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

The provider table also has a unique client-reference constraint. Inserts use PostgreSQL `ON CONFLICT DO NOTHING`, so simultaneous retries cannot create duplicate provider transactions.

This mirrors the purpose of Mastercard Send's `repeat-flag`, documented for resending after no response or `UNKNOWN` status.

## Double-entry ledger

The internal `SUCCEEDED` state means the configured payment provider has returned a successful/approved outcome. It does not claim that downstream interbank settlement has already completed. The journal type is therefore `PAYOUT_CONFIRMED`, not `PAYOUT_SETTLED`.


A successful payout creates:

```text
DEBIT   SELLER_PAYABLE:<recipient>   amount currency
CREDIT  CASH_CLEARING                amount currency
```

Both lines belong to one `ledger_transaction`.

The unique `payout_id` constraint and duplicate-safe insert ensure one journal transaction per payout even when multiple workers race.

A deferred PostgreSQL constraint trigger independently verifies at commit that every journal transaction has exactly two entries, one debit and one credit, each equal to the transaction amount and using the transaction currency. An imbalanced journal is rejected even if application code bypasses `LedgerPostingService`.

PostgreSQL also rejects UPDATE and DELETE operations on committed ledger transactions and entries. The journal is therefore append-only at the database boundary, not merely by application convention.

Ledger posting occurs inside the same database transaction that transitions the payout to `SUCCEEDED`. If journal persistence or the database balance invariant fails, the success transition rolls back too.

Unknown and failed payouts are deliberately absent from the ledger.

## Failure injection

Failure behavior is not an argument on the business processing endpoint.

The simulation-only API configures the next provider outcome separately. This keeps the payout interface shaped like a real payment service.

## Concurrency

Each payout row contains a JPA `@Version` field.

Concurrent processors may both begin from the same snapshot, but only one can commit a conflicting payout state transition. The provider and ledger layers independently enforce uniqueness as additional safety boundaries.

The integration suite covers concurrent payout creation, processing, and retry paths and verifies that one external provider transaction and one two-line ledger transaction survive.

## Reconciliation and crash recovery

Reconciliation queries the provider using the payout UUID as the stable client reference.

The scheduled worker handles both `UNKNOWN` payouts and stale `PROCESSING` payouts. The latter covers the crash window where the external provider completed a request but the application died or failed to persist the final local state. Fresh `PROCESSING` payouts are left alone until the configured stale threshold expires.

- provider reports `SUCCEEDED`: resolve to `SUCCEEDED` and post the ledger
- provider reports `DECLINED`: resolve to `FAILED`
- provider reports `UNKNOWN` or `PENDING`: preserve `UNKNOWN`
- provider has no record: preserve `UNKNOWN`

The simulated provider can independently advance an existing transaction from `PENDING` or `UNKNOWN` to a terminal state. Terminal provider states are immutable; a later reversal would require a distinct reversal model rather than rewriting historical success. This models asynchronous provider processing and lets reconciliation demonstrate convergence rather than a static lookup.

Automatic reconciliation uses bounded exponential backoff based on persisted attempt history. The first unresolved payout is checked immediately; subsequent checks back off from 30 seconds to a configurable four-minute cap. Manual reconciliation remains available regardless of the automatic schedule.

Every reconciliation attempt is stored separately from the state-transition audit trail.

## Reversal boundary

The current lifecycle ends at local confirmation or failure. A provider status such as `REVERSED` or `CANCELLED` can resolve an unresolved payout as a non-success, but the system does not rewrite an already-`SUCCEEDED` payout.

Supporting a reversal after local success would require a separate reversal lifecycle and compensating journal transaction linked to the original payout. That design is intentionally left distinct because the ledger is append-only and the original approval remains an auditable historical event.

## Auditability

State changes produce immutable `payout_events` records containing payout ID, event type, previous state, new state, and timestamp.

## Observability

The application exposes low-cardinality payment metrics. A gauge tracks unresolved `UNKNOWN` payouts, and Prometheus includes an alert for ambiguous payouts that remain unresolved.

Application logs use payout IDs and provider references for correlation without logging recipient or payment details.

## Security boundary

Secrets are not part of simulator configuration.

The Mastercard adapter loads credentials from external configuration and uses Mastercard's official request-signing library. It rejects production Mastercard hosts and intentionally supports sandbox endpoints only. Private keys, consumer keys, PANs, and production payment data must never be committed to this repository.
