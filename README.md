# Payment Processing Simulator

[![CI](https://github.com/yyan115/payment-processing-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/yyan115/payment-processing-simulator/actions/workflows/ci.yml)
[![CodeQL](https://github.com/yyan115/payment-processing-simulator/actions/workflows/codeql.yml/badge.svg)](https://github.com/yyan115/payment-processing-simulator/actions/workflows/codeql.yml)

A Java 21 / Spring Boot / PostgreSQL payment engine with a small React demo. Explore what happens when a payment succeeds but its confirmation is lost, and recover without paying twice.

**[Open the demo](https://payment-simulator.redforest-1d69de67.eastasia.azurecontainerapps.io)** · Backup: [Blitz](https://payment-processing-simulator.yyan115.blitz.cloud), which sleeps between visits and can take about a minute to start.

![Payment simulator](docs/images/simulator.png)

## Use it

Pick a sender, recipient and scenario, then **Send payment**. A diagram shows the payment platform, which sends the payment and keeps the records, and the payment network, which moves the money. Each side shows its own status, and the messages between them are animated step by step, with a short explanation of each step underneath. **Playback** (simulated network only) switches between Automatic and Step by step, where each step waits for **Next step**. Expand a row in **History** for its events, idempotency key, journal entry and captured API requests. The **Ledger** section shows running totals per account across the session.

| Scenario | What happens | How the platform handles it |
| --- | --- | --- |
| Approved payment | The network approves the payment | Records `SUCCEEDED` and posts a journal entry, one debit and one credit |
| Declined payment | The network declines the payment | Records `FAILED` and posts nothing |
| Response lost | The network completes the payment, but its response is lost | Records `UNKNOWN`, reconciles by asking the network, finds the payment was made, and records `SUCCEEDED` |
| Request lost | The request never reaches the network | Records `UNKNOWN`, reconciles, finds no record, and sends again with the same reference |
| Pending payment | The network has not finished the payment | Records `UNKNOWN`, waits, reconciles, and records the final result |
| Unknown outcome | The network cannot report a result | Keeps `UNKNOWN` and does not send again |

The simulator uses SGD without currency conversion. Participants are three fixed demo names, not bank accounts. The optional **Mastercard API sandbox** and **Visa API sandbox** networks use configured official test fixtures in USD and have no scenarios. Both networks run through the same backend state machine and ledger. No real money moves.

## Run locally

```bash
docker compose up --build
```

Open **http://localhost:8080**. Mastercard and Visa credentials are optional. The UI and Java API run in one application; PostgreSQL stores the actual payment records. Each browser tab has its own isolated workspace. Refreshing the page or closing the tab starts a new one, and the server removes workspaces that have been idle for 6 hours, or 30 minutes if they hold no payments.

## What the backend guarantees

- **Idempotency:** the same creation key and intent return the original payment; changed intent returns `409`. The demo automatically checks a duplicate creation request after each run.
- **Safe recovery:** uncertain outcomes remain explicit; retries preserve the original provider reference. Mastercard repeats use `Repeat-Flag`, and Visa resends carry the same transaction identifiers.
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
