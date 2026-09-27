# Security

This repository is a payment-systems learning project and must use synthetic or sandbox data only.

## Credentials

Never commit:

- Mastercard consumer keys
- PKCS#12 signing keys or passwords
- production card or bank-account data
- database credentials outside local development defaults
- any other private payment-provider secret

The Mastercard adapter reads credentials from external configuration. The `.env` file is ignored by Git; `.env.example` contains placeholders only.

If a credential is accidentally committed, treat it as compromised and revoke or rotate it immediately. Removing it from the latest commit is not sufficient because Git history may still contain it.

## Data handling

Do not use real PANs, customer identities, or production financial data with this simulator. Logs are designed around internal payout IDs and provider references rather than recipient details.

## Vulnerability reports

Do not place secrets, credentials, or sensitive financial data in a public GitHub issue. Report reproducible security defects without sensitive material and rotate any credential that may have been exposed.

## Runtime container

The final application image runs as a dedicated unprivileged user and includes an application health check. Docker Compose runs the app with a read-only root filesystem, a temporary writable `/tmp`, all Linux capabilities dropped, and `no-new-privileges`.

CI boots PostgreSQL and the built application container and waits for the Actuator health endpoint, so the runtime image and startup path are exercised rather than only syntax-checked.

## Automated checks

GitHub Actions runs the test suite on pushes and pull requests. CodeQL performs Java static security analysis using the security-extended query suite. Dependabot tracks Maven, npm, Docker, and GitHub Actions dependencies. CodeQL also analyzes the TypeScript interface.

## Public demo boundary

Keep `DEMO_ENABLED=true` for a public deployment. It scopes requests by a random HttpOnly, SameSite=Strict cookie, isolates payout ownership and idempotency keys, enforces quotas and expires temporary records. Only health is exposed through Actuator in this mode. The UI and API share an origin; cross-site browser API requests are rejected.

The simulator accepts synthetic display references and amounts. It never asks visitors for real card or bank details. The optional Mastercard view uses fixed official sandbox parties, server-side signing and a shared persistent outbound-call budget. The runtime accepts the signing key as a mounted private file or a secret base64 value decoded into `/tmp` with restrictive permissions. Neither belongs in an image or repository.

`DEMO_ENABLED=false` is an unscoped development API with permanent records, intended for a trusted local lab. It is not an authenticated production payment service. Compose binds published ports to loopback by default.

Only explicitly expired temporary workspaces can be purged. Journal and audit updates remain prohibited, and permanent payment records remain protected from deletion by database triggers. The demo cookie is a bearer capability; users sharing a browser profile share that workspace.
