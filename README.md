# Payment Processing Simulator

[![CI](https://github.com/yyan115/payment-processing-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/yyan115/payment-processing-simulator/actions/workflows/ci.yml)
[![CodeQL](https://github.com/yyan115/payment-processing-simulator/actions/workflows/codeql.yml/badge.svg)](https://github.com/yyan115/payment-processing-simulator/actions/workflows/codeql.yml)

A Java 21 / Spring Boot / PostgreSQL payment engine with a small React demo. Explore what happens when a payment succeeds but its confirmation is lost, and recover without paying twice.

**[Open the demo](https://payment-processing-simulator.yyan115.blitz.cloud)** · Free hosting sleeps between visits; startup can take about a minute.

![Payment simulator](docs/images/simulator.png)

## Use it

Choose participants and a scenario, then **Send payment**. The app creates and processes the payment, checks uncertain outcomes, and safely repeats a request that never reached the simulated provider. Expand a row in **History** for its events, idempotency key, ledger and captured API requests.

| Scenario | Automatic behavior |
| --- | --- |
| Payment succeeds | Confirm success and post one balanced journal |
| Payment declined | Record decline; no journal |
| Response lost | Reconcile the provider’s successful record |
| Request never arrives | Look up the original reference, then safely repeat it |
| Still processing | Simulate a later provider approval, then reconcile |
| Provider is uncertain | Keep `UNKNOWN` when the provider cannot confirm a result |

The simulator uses SGD without currency conversion. Participant names are demo labels, not bank accounts. The optional **Mastercard sandbox** provider uses configured official test fixtures in USD and cannot be controlled by the scenario selector. Both providers run through the same backend state machine and ledger. No real money moves.

## Run locally

```bash
docker compose up --build
```

Open **http://localhost:8080**. Mastercard credentials are optional. The UI and Java API run in one application; PostgreSQL stores the actual payment records. Each visitor has an isolated temporary workspace. Refresh preserves it; expired workspaces are cleaned up by the server.

## What the backend guarantees

- **Idempotency:** the same creation key and intent return the original payment; changed intent returns `409`. The demo automatically checks a duplicate creation request after each run.
- **Safe recovery:** uncertain outcomes remain explicit; retries preserve the original provider reference. Mastercard repeats use `Repeat-Flag`.
- **Atomic ledger:** confirmed success, audit and two balanced ledger entries commit together. Database constraints prevent duplicate journals and unbalanced entries.
- **Concurrency:** unique constraints and optimistic locking protect competing creation and processing requests.
- **Isolation and limits:** workspaces cannot access one another’s payments; database-backed Mastercard budgets limit outgoing calls. Optional Turnstile verification protects external-provider actions.

Authenticated Mastercard sandbox creation and reference lookup were verified on the public deployment on **2026-10-02**. This is sandbox integration evidence, not production settlement. Public deployment verification is recorded in the [deployment guide](docs/deployment.md).

## Development

- [Setup and tests](docs/development.md)
- [API examples](docs/api.md)
- [Mastercard setup](docs/mastercard.md)
- [Deployment](docs/deployment.md)
- [Design](docs/design.md) and [security](SECURITY.md)

Backend tests exercise real PostgreSQL transactions, concurrent requests, immutable records and provider contracts. Browser tests exercise all six scenarios, repeated payments, reload, session isolation, network failures and mobile layout. External Mastercard tests are opt-in.

This project models payout processing and recovery. It does not model balances, FX, fees, card-purchase authorization, bank settlement or post-success reversals.
