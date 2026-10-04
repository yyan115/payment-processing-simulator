# Development

Requirements: Java 21, Maven 3.9, Node 22, Docker (for PostgreSQL and the packaged app).

## Layout

```text
src/main/java/dev/yycodes/paymentsimulator/
  payout/           Payouts: creation, state changes, sending, inspection
  provider/         Payment network adapters: simulated, mastercard/, visa/
  ledger/           Journal posting and queries
  reconciliation/   Reconciliation worker, backoff, attempt records
  audit/            Audit events
  demo/             Workspaces, rate limits, sandbox budgets, Turnstile
  observability/    Metrics
  shared/           Money rules, errors
src/main/resources/db/migration/   Flyway migrations V1 to V14
frontend/src/       React app: components/, hooks/, api/, domain/
frontend/e2e/       Playwright tests
ops/                Dockerfile entrypoint, Azure scripts, Prometheus config
```

## Run

```bash
docker compose up --build        # app and PostgreSQL on http://localhost:8080
```

To work on the code, start a database and the backend, then the frontend:

```bash
docker run -d --name payments-dev-db -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=payments -e POSTGRES_PASSWORD=payments \
  -e POSTGRES_DB=payments postgres:17-alpine

DEMO_ENABLED=true RECONCILIATION_ENABLED=false mvn spring-boot:run   # port 8080
cd frontend && npm ci && npm run dev                                  # http://127.0.0.1:5173
```

Vite proxies `/api` to port 8080. To switch on Mastercard or Visa, see [Mastercard](mastercard.md) and [Visa](visa.md).

## Tests

**Backend.** The tests truncate tables, so use a separate database:

```bash
docker exec payments-dev-db createdb -U payments payments_test
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/payments_test mvn verify
```

They use real PostgreSQL transactions, constraints and concurrent requests. They need no Mastercard or Visa credentials. `mvn verify` also checks formatting. Run `mvn spotless:apply` to fix it.

**Frontend.**

```bash
cd frontend
npm test                    # unit tests
npm run format:check        # Prettier
npm run build
```

**Browser tests** need a running backend with `DEMO_ENABLED=true`. Each test opens a workspace, so raise the admission limit with `DEMO_ADMISSIONS_PER_MINUTE=120`.

```bash
npx playwright install chromium
npm run test:e2e                                       # starts Vite if needed
E2E_BASE_URL=http://localhost:8080 npm run test:e2e    # the packaged app instead
```

Steps are paced at about two seconds for viewers. Tests remove the pause by setting `localStorage["payment-simulator-pace"]` to `"0"`.

Two further suites are opt-in:

```bash
npm run test:matrix                                    # every scenario, sender, recipient and playback mode
MASTERCARD_E2E=true VISA_E2E=true npm run test:e2e     # live sandbox payments
```

The matrix opens one workspace per case, so it also needs the higher admission limit. Live runs are spaced out because the sandboxes answer 429 to bursts.

## Smoke test

```bash
docker compose up --build --detach
python3 scripts/smoke-demo.py
```

It checks the packaged UI, a workspace, a lost response, reconciliation and idempotency over HTTP. CI runs it, then the browser tests against the same container.

## README media

```bash
node scripts/readme-media.mjs     # needs the app on :8080 and ffmpeg
```

Regenerates `docs/images/demo.gif`, `simulator.png` and `records.png`.
