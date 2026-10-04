# API

All routes start with `/api/v1`. Errors are JSON with `status`, `error` and `message`.

## Walkthrough

Start the app with `docker compose up --build`. In demo mode each caller needs a workspace. The browser sends its workspace ID in `X-Workspace-Id`. Curl can keep the cookie instead.

```bash
JAR=$(mktemp)
curl -c "$JAR" -X POST http://localhost:8080/api/v1/workspace

# Create a payout. Repeating this request returns the same payout.
curl -b "$JAR" -X POST http://localhost:8080/api/v1/payouts \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: first-payout' \
  -d '{"recipientReference":"seller-42","amount":"100.00","currency":"SGD","provider":"simulated"}'
```

Set `ID` to the returned `id`. Make the network complete the payment but lose its reply, then send:

```bash
curl -b "$JAR" -X PUT "http://localhost:8080/api/v1/simulation/payouts/$ID/next-outcome" \
  -H 'Content-Type: application/json' -d '{"outcome":"TIMEOUT_AFTER_SUCCESS"}'
curl -b "$JAR" -X POST "http://localhost:8080/api/v1/payouts/$ID/process"
curl -b "$JAR" "http://localhost:8080/api/v1/payouts/$ID/snapshot"
```

The snapshot shows `payout.status` `UNKNOWN`, `provider.status` `SUCCEEDED` and `ledger` null: the network paid and the platform does not know yet. Reconcile:

```bash
curl -b "$JAR" -X POST "http://localhost:8080/api/v1/payouts/$ID/reconcile"
curl -b "$JAR" "http://localhost:8080/api/v1/payouts/$ID/ledger"
```

The payout is now `SUCCEEDED` with one journal of two entries. Creating it again with the same key returns 200 and the same payout. The same key with a different amount, currency, recipient or network returns 409.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/workspace` | Open or reuse a workspace. `?reset=true` starts a new one. |
| GET | `/config` | Which networks are configured, and demo settings. No credentials. |
| POST | `/payouts` | Create a payout. Needs `Idempotency-Key`. Returns 201, or 200 for a repeat. |
| GET | `/payouts?page=0&size=20` | The workspace's payouts, newest first. Page size is at most 100. |
| GET | `/payouts/{id}` | One payout. |
| POST | `/payouts/{id}/process` | Send a `CREATED` payout to its network. |
| POST | `/payouts/{id}/retry` | Send an `UNKNOWN` payout again with the same reference. |
| POST | `/payouts/{id}/reconcile` | Ask the network about an `UNKNOWN` or `PROCESSING` payout and apply the answer. |
| GET | `/payouts/{id}/snapshot` | Payout, journal, events and reconciliation attempts from one consistent read. |
| GET | `/payouts/{id}/provider` | Ask the network about the payout. Changes nothing. |
| GET | `/payouts/{id}/events` | Audit trail. |
| GET | `/payouts/{id}/ledger` | The journal. 404 until the payout succeeds. |
| GET | `/ledger/accounts` | Debit and credit totals per account. |
| GET | `/ledger/entries` | Every posting in order. |
| PUT | `/simulation/payouts/{id}/next-outcome` | Set what the simulated network does next: `SUCCESS`, `DECLINED`, `TIMEOUT_AFTER_SUCCESS`, `TIMEOUT_BEFORE_PROCESSING`, `PENDING` or `UNKNOWN`. |
| PUT | `/simulation/payouts/{id}/provider-status` | Resolve an unresolved simulated payment to `SUCCEEDED` or `DECLINED`. |
| GET, POST | `/sandbox-verification` | Read or complete the Turnstile check, when enabled. |

`provider` in a request is the payment network: `simulated`, `mastercard` or `visa`. The simulation routes reject Mastercard and Visa payouts, and the snapshot leaves out their network record. Use `/provider` to ask them.

## Status codes

| Code | When |
| --- | --- |
| 400 | Invalid input, or a network that is not configured |
| 404 | Unknown payout, or one that belongs to another workspace |
| 409 | Idempotency key reused for a different request, a state change that is not allowed, or a concurrent update |
| 410 | The workspace expired |
| 429 | A workspace, rate or sandbox limit |
| 502, 503 | A network rejected the call, or did not answer. The payout keeps its state. |

With `DEMO_ENABLED=false` there are no workspaces and records are kept. That mode has no authentication and is for local use only.
