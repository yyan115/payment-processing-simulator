# Development and verification

The simplest run is `docker compose up --build`, then http://localhost:8080. The full frontend is bundled into the Java application. To stop it, run `docker compose down`; the database volume persists, while expired demo sessions are purged on the next run.

## Develop without a containerized application

Requirements: Java 21+, Maven 3.9+, Node 22.12+, and PostgreSQL 17. An existing local PostgreSQL installation is fine. For a disposable development database:

```bash
docker run -d --name payments-dev-db \
  -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=payments -e POSTGRES_PASSWORD=payments \
  -e POSTGRES_DB=payments_dev postgres:17-alpine
```

After PostgreSQL is ready, start the backend in one terminal:

```bash
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/payments_dev \
DEMO_ENABLED=true RECONCILIATION_ENABLED=false mvn spring-boot:run
```

Start the frontend in another:

```bash
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies API requests to the Java service on port 8080. Icons are bundled locally.

## Backend tests

**Use a dedicated database: integration tests truncate payment tables.** With the disposable database container above:

```bash
docker exec payments-dev-db createdb -U payments payments_test
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/payments_test mvn verify
```

The suite uses real PostgreSQL transactions and constraints, including concurrent requests. It does not require Mastercard keys or external sandbox access.

## Frontend and browser tests

```bash
cd frontend
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser tests need a running backend with `DEMO_ENABLED=true`, `RECONCILIATION_ENABLED=false` and a disposable database. Playwright starts Vite if necessary. To test the packaged Docker application instead:

```bash
E2E_BASE_URL=http://localhost:8080 npm run test:e2e
```

The simulated network’s steps are paced (about a second each) so a viewer can follow them. Browser tests remove the pause by setting `localStorage["payment-simulator-pace"]` to `"0"`; one test sets it to `"500"` and checks that steps appear one at a time.

The live Mastercard browser test is skipped by default. After configuring private sandbox credentials, explicitly opt in:

```bash
MASTERCARD_E2E=true npm run test:e2e -- --grep 'authenticated Mastercard'
```

This makes external sandbox requests. All ordinary tests remain deterministic and credential-free.

## Packaged runtime smoke check

```bash
docker compose up --build --detach
python3 scripts/smoke-demo.py
```

The script verifies frontend delivery, a private workspace, lost-response handling, reconciliation and duplicate protection against the running application. CI runs this and the browser suite against the final image, with the Java service running as an unprivileged user on a read-only filesystem.
