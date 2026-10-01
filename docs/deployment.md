# Deployment

The public app is at **https://payment-processing-simulator.yyan115.blitz.cloud**.

Blitz builds the root Dockerfile from GitHub `main` and serves the React UI and Java API over HTTPS. Pushes trigger deployment. Its managed PostgreSQL database supplies `DATABASE_URL`; the application converts that URI into JDBC settings automatically. This setting takes precedence over older `SPRING_DATASOURCE_*` connection settings.

## Blitz setup

1. Connect the GitHub repository and select `main`.
2. Create a PostgreSQL database under **Databases** and connect it to the app.
3. Add private settings:

```dotenv
DEMO_ENABLED=true
RECONCILIATION_ENABLED=false
SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=5
SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE=0
```

Deploy. Flyway retries a temporarily unavailable database before creating or updating the schema. Inspect startup logs and `/actuator/health` before testing a payment. The demo runs recovery steps during the browser workflow; the scheduled reconciliation worker is available for persistent local operation.

Free apps sleep after inactivity. Blitz displays its own waking page before our app can load. Once our UI loads, connection failures are checked automatically with backoff. A payment whose HTTP response was lost keeps its original idempotency key and offers **Resume unfinished request**, preventing an accidental new payment.

## Mastercard sandbox

Configure the server-only settings in [Mastercard setup](mastercard.md). Upload the signing container as `MASTERCARD_P12_BASE64`; the runtime decodes it into a private temporary file. Never place credentials in frontend build variables or Git. The adapter accepts sandbox hosts only.

The default shared budget is 12 outgoing Mastercard calls per minute and 100 per UTC day. Each session also has a 10-call allowance. Sending and looking up a payment consume separate calls. Counters persist in PostgreSQL.

## Optional bot verification

Create a **managed Turnstile widget** for the app hostname, then set:

```dotenv
TURNSTILE_REQUIRED=true
TURNSTILE_SITE_KEY=<public widget key>
TURNSTILE_SECRET_KEY=<private verification key>
TURNSTILE_HOSTNAME=payment-processing-simulator.yyan115.blitz.cloud
```

The browser requests verification before Mastercard use. The server verifies Cloudflare’s token, hostname and `mastercard` action, then grants access until that workspace expires. Processing, retry, reconciliation and direct provider lookup enforce verification. Browsing and the simulated provider remain open. Missing required configuration prevents startup instead of silently disabling protection.

**Activation requires real Cloudflare keys.** Test fixtures are never used as live protection.

## Hosting status

- The app now uses Blitz PostgreSQL 17.11. Startup validated all 13 migrations; the public payment/ledger smoke check and all 20 browser tests passed on 2026-10-02, including authenticated Mastercard submission and reference lookup.
- Neon is no longer the active database; its connection settings were removed from Blitz. Its databases remain intact for rollback.
- The first database connection was refused; restarting the app established the connection. Turnstile activation still needs real Cloudflare keys.

[Blitz database documentation](https://blitz.cloud/docs/databases/) · [Plan limits](https://blitz.cloud/docs/limits/) · [Turnstile verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
