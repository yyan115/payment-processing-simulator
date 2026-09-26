# Design Notes

## Core invariant

A transport result is not automatically a payment result.

If an HTTP call times out, the application knows only that it did not receive the response. The provider may have:

1. never received the request,
2. received but not processed it,
3. completed the payout successfully,
4. completed it and lost only the response.

The local model therefore contains an explicit `UNKNOWN` state.

## Payout lifecycle

```text
CREATED -> PROCESSING -> SUCCEEDED
                    \-> FAILED
                    \-> UNKNOWN -> SUCCEEDED
                              \-> FAILED
                              \-> UNKNOWN
```

Invalid transitions are rejected by the `Payout` domain object instead of relying on controllers to mutate status fields correctly.

## Idempotency

Every create request supplies an `Idempotency-Key`.

The service canonicalizes the request intent from:

- recipient reference
- normalized amount
- normalized ISO currency code

and stores its SHA-256 fingerprint with the key.

This creates two distinct behaviours:

- same key + same fingerprint: return the existing payout
- same key + different fingerprint: reject with a conflict

A unique database constraint is the final authority. The service also handles the race where two requests both observe that the key is absent before one wins the insert.

## Concurrency

Each payout row contains a JPA `@Version` field.

Two workers can read the same state, but they cannot both commit conflicting transitions against the same version. Depending on timing, the loser sees either an invalid current state or an optimistic-lock conflict.

The integration suite separately exercises concurrent idempotent creation.

## Provider model

The simulator persists provider transactions independently from local payout state.

`TIMEOUT_AFTER_SUCCESS` intentionally performs these steps in order:

1. persist provider success,
2. simulate loss of the response,
3. let the payment service record `UNKNOWN`.

That ordering creates the classic ambiguous-outcome problem.

`TIMEOUT_BEFORE_PROCESSING` throws before a provider record exists. Both cases initially produce `UNKNOWN`, but reconciliation distinguishes them.

## Reconciliation

Reconciliation queries the provider using the payout UUID as the stable client reference.

Possible outcomes:

- provider reports `SUCCEEDED`: resolve local payout to `SUCCEEDED`
- provider reports `DECLINED`: resolve local payout to `FAILED`
- provider has no record: preserve `UNKNOWN`

The third case deliberately avoids making up a result.

Every reconciliation attempt is stored separately from the state-transition audit trail.

## Auditability

State changes produce immutable `payout_events` records containing:

- payout ID
- event type
- previous state
- new state
- timestamp

No API exists to rewrite historical events.

## Observability

The application exposes low-cardinality payment metrics rather than tagging metrics with payout IDs or recipient information.

A gauge tracks the current count of unresolved `UNKNOWN` payouts. Prometheus includes an alert rule for payouts that remain ambiguous.

Application logs use payout IDs and provider references for correlation without logging the recipient or other payment details.

## Security boundary

Secrets are not part of the simulator configuration.

A real Mastercard adapter will load credentials from external configuration and use Mastercard's official request-signing library. Private keys, consumer keys, PANs, and production payment data must never be committed to this repository.
