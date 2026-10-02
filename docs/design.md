# Payment engine design

## State and uncertainty

```text
CREATED → PROCESSING → SUCCEEDED
                    → FAILED
                    → UNKNOWN → SUCCEEDED / FAILED / UNKNOWN
```

A timeout means no confirmation arrived; it does not establish whether the provider paid. Business declines resolve to `FAILED`. Transport errors, authentication failures and ambiguous provider responses preserve uncertainty.

The application models provider confirmation, not final interbank settlement. Post-success reversals require a separate lifecycle and compensating journal; rewriting an approved payment would erase history.

## Duplicate protection

Creation requires an `Idempotency-Key`. The server canonicalizes recipient, amount and currency, and stores a SHA-256 fingerprint. Matching key, intent and provider return the original payout; changed intent returns `409`. A database uniqueness constraint resolves concurrent creation races.

Provider submissions use the payout UUID as a stable reference. A deliberate repeat retains it; Mastercard requests also set `Repeat-Flag: true`. The simulated provider has its own durable record and unique client-reference constraint. Application idempotency and provider duplicate protection cover different stages.

## Atomic accounting

Confirmed success posts one `PAYOUT_CONFIRMED` journal:

```text
DEBIT  SELLER_PAYABLE:<recipient>  amount currency
CREDIT CASH_CLEARING             amount currency
```

The success transition, audit event and journal commit in one database transaction. A unique payout-to-journal constraint prevents duplicate posting. Deferred PostgreSQL triggers require exactly two entries, equal amount/currency, and opposite directions. Invalid accounting rolls back the success transition.

Ledger and audit updates are forbidden by database triggers. Deletion is allowed only for explicitly expired temporary demo records; permanent and active-workspace records remain protected.

Amounts use `BigDecimal` and ISO 4217 precision. The adapter converts major units to minor units without rounding. The demo uses SGD for simulation and the published USD Mastercard test fixture; it performs no FX.

## Recovery

Reconciliation queries the original provider reference and records every attempt:

- Success: confirm and post the journal.
- Decline: record failure without a journal.
- Pending, unknown or missing record: preserve uncertainty.

The optional scheduled worker checks `UNKNOWN` and stale `PROCESSING` payments with persisted exponential backoff. Stale processing covers a crash after external success but before local confirmation. Fresh processing is left alone until the stale threshold.

The browser demo orchestrates creation, processing and recovery in one Send action and shows each step as a diagram of the payment platform and the payment network, with a short explanation underneath. Every step is derived from the real API responses and the network’s own record, so a viewer can see the two sides disagree (for example, the network shows the payment completed while the platform’s status is `UNKNOWN`). The simulated network’s steps are paced so they can be followed; Mastercard steps show real timing. Lost-response payments reconcile; simulated requests that never arrived are safely repeated. The pending scenario advances the simulated provider to approval before reconciliation. The uncertain scenario remains unresolved.

After an ambiguous HTTP failure, the browser retains the original intent and key. Resuming checks existing state before processing; a confirmed payment is never sent again. Browser interruption can pause this demo orchestration; the scheduled worker is the separate persistent-recovery option.

## Concurrency and evidence

Payouts use optimistic locking. Provider and ledger uniqueness provide additional independent boundaries. Snapshot reads use repeatable-read transactions so payment, ledger and audit agree.

Provider routing follows the payout’s stored selection. Simulated snapshots include the independent provider record; Mastercard status lookup performs a separate signed external call. UI request captures are per payment and stored in the browser tab; authoritative events and ledger come from PostgreSQL.

## Public demo

A random workspace id identifies an isolated workspace. Each page keeps its id in tab storage and sends it in the X-Workspace-Id header, so every tab has its own workspace and a refresh starts a new one. Without the header the server falls back to a browser-session cookie, which is how curl and the API examples work. The server expires a workspace after 6 hours without requests, and each request extends that allowance. A workspace with no payments expires after 30 minutes instead, since it holds nothing, and at most 3000 workspaces are live at once. Resource access checks ownership, lists are scoped, and idempotency keys are namespaced. Quotas bound payouts, admissions and requests. Expired workspaces are removed in batches after a grace period; reset does not undo external sandbox transactions.

The database also stores shared and per-session Mastercard call budgets. Optional Turnstile validation grants external-provider access only until the workspace expires. The adapter accepts sandbox hosts only, and signing credentials stay on the server.

A browser cannot reliably notify the server when it closes. Server expiry therefore handles cleanup; browser-only storage cannot replace the transactional payment/ledger database.
