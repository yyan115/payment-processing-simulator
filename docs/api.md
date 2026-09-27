# Payout API walkthrough

Start the application with `docker compose up --build`. Demo mode requires a workspace cookie; the browser handles this automatically. For curl:

```bash
COOKIE_JAR=$(mktemp)
curl -c "$COOKIE_JAR" -X POST http://localhost:8080/api/v1/workspace
curl -b "$COOKIE_JAR" -i -X POST http://localhost:8080/api/v1/payouts \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: first-payout' \
  -d '{"recipientReference":"seller-42","amount":"100.00","currency":"SGD","provider":"simulated"}'
```

Copy the returned `id` into `PAYOUT_ID`, then lose the provider response:

```bash
PAYOUT_ID=replace-with-the-returned-uuid
curl -b "$COOKIE_JAR" -X PUT "http://localhost:8080/api/v1/simulation/payouts/$PAYOUT_ID/next-outcome" \
  -H 'Content-Type: application/json' -d '{"outcome":"TIMEOUT_AFTER_SUCCESS"}'
curl -b "$COOKIE_JAR" -X POST "http://localhost:8080/api/v1/payouts/$PAYOUT_ID/process"
curl -b "$COOKIE_JAR" "http://localhost:8080/api/v1/payouts/$PAYOUT_ID/snapshot"
```

The snapshot shows `payout.status=UNKNOWN`, `provider.status=SUCCEEDED` and `ledger=null`. Reconcile:

```bash
curl -b "$COOKIE_JAR" -X POST "http://localhost:8080/api/v1/payouts/$PAYOUT_ID/reconcile"
curl -b "$COOKIE_JAR" "http://localhost:8080/api/v1/payouts/$PAYOUT_ID/ledger"
```

The ledger now contains one debit and one credit. Repeating the creation request with the original key returns HTTP 200 and the same payout. Changing its amount, currency, recipient or provider under that key returns HTTP 409.

## Routes

All paths below start with `/api/v1`.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/workspace` | Open or reuse a temporary workspace; `?reset=true` starts another |
| GET | `/config` | Provider availability and demo/reconciliation settings; no credentials |
| POST | `/payouts` | Create a payout with `Idempotency-Key`; provider defaults to server configuration |
| GET | `/payouts?page=0&size=20` | List this workspace’s payouts; maximum page size 100 |
| GET | `/payouts/{id}` | Current payout |
| POST | `/payouts/{id}/process` | Submit a `CREATED` payout |
| POST | `/payouts/{id}/retry` | Safely repeat an `UNKNOWN` payout with its original reference |
| POST | `/payouts/{id}/reconcile` | Look up an `UNKNOWN` or `PROCESSING` payout and apply the result |
| GET | `/payouts/{id}/snapshot` | Consistent local payout, journal, events and reconciliation attempts |
| GET | `/payouts/{id}/provider` | Explicit provider lookup; does not alter the local payout |
| GET | `/payouts/{id}/events` | Audit trail |
| GET | `/payouts/{id}/ledger` | Confirmed journal; 404 before confirmation |
| PUT | `/simulation/payouts/{id}/next-outcome` | Configure the next simulated submission using `{ "outcome": "PENDING" }` |
| PUT | `/simulation/payouts/{id}/provider-status` | Advance an uncertain simulated record using `{ "status": "SUCCEEDED" }` or `DECLINED` |

A Mastercard snapshot does not call the external API or invent provider evidence. Use the explicit provider lookup for that. Simulation controls reject Mastercard payouts.

Expired workspace requests return `410`; records belonging to another workspace return `404`; quotas return `429`. `DEMO_ENABLED=false` enables the unscoped local lab API without cookies and keeps records permanently. That mode has no public-user authentication and should remain local.
