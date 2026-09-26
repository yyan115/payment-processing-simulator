# Payment Processing Simulator

A Java/Spring Boot backend for exploring payment correctness under retries, timeouts, concurrent requests, and reconciliation.

The first scenario models a payout whose provider response disappears after the provider has already completed the transfer:

1. Create a payout with an idempotency key.
2. Submit it to a simulated external payment provider.
3. Simulate a timeout after provider-side success.
4. Keep the local payout in `UNKNOWN` instead of incorrectly marking it failed.
5. Reconcile against the provider's durable record and resolve it to `SUCCEEDED`.

## Stack

Java 21, Spring Boot 4.1, PostgreSQL, Spring Data JPA, Flyway, Maven, GitHub Actions.

## Run

```bash
docker compose up -d postgres
mvn spring-boot:run
```

Health check:

```bash
curl http://localhost:8080/actuator/health
```

### Create a payout

```bash
curl -i -X POST http://localhost:8080/api/v1/payouts \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-payout-001' \
  -d '{"recipientReference":"seller-42","amount":100.00,"currency":"SGD"}'
```

### Simulate a lost response after provider success

```bash
curl -X POST http://localhost:8080/api/v1/payouts/<PAYOUT_ID>/process \
  -H 'Content-Type: application/json' \
  -d '{"outcome":"TIMEOUT_AFTER_SUCCESS"}'
```

The local payout becomes `UNKNOWN`, while the simulated provider has a durable successful transaction.

### Reconcile

```bash
curl -X POST http://localhost:8080/api/v1/payouts/<PAYOUT_ID>/reconcile
```

The payout resolves to `SUCCEEDED`.

## What this demonstrates

- **Idempotency:** retries with the same request intent return the same payout.
- **State transitions:** invalid lifecycle transitions are rejected.
- **Failure semantics:** a timeout is treated as an unknown outcome, not proof of failure.
- **Reconciliation:** uncertain local state can be resolved against an external provider record.
- **Persistence and testing:** PostgreSQL-backed state, schema migrations, and integration tests.

## Roadmap

- Mastercard sandbox adapter behind the payment-provider interface
- richer reconciliation and mismatch reporting
- structured audit events and metrics
- asynchronous processing where it solves a concrete reliability problem
