# Security

This is a learning project. It uses synthetic and sandbox data only, and it must never handle real card numbers, customer identities or production financial data.

## Credentials

Never commit Mastercard or Visa credentials, PKCS#12 keys or PEM files, passwords, or database credentials other than the local development defaults. The application reads secrets from the environment. `.env` is ignored by Git and `.env.example` holds placeholders only.

If a credential is committed, treat it as compromised and rotate it. Deleting it from the latest commit does not remove it from history.

## Reporting a vulnerability

Open a [private security advisory](https://github.com/yyan115/payment-processing-simulator/security/advisories/new) on GitHub. Leave secrets and sensitive data out of public issues.

## What is in place

- **Container:** runs as an unprivileged user with a health check. Docker Compose adds a read-only root filesystem, a temporary `/tmp`, all Linux capabilities dropped and `no-new-privileges`.
- **Public demo:** each workspace is isolated by a random ID. Rate limits, per-workspace quotas and expiry bound resource use. Only `/actuator/health` is public. The UI and API share an origin, and responses carry `nosniff`, `X-Frame-Options: DENY` and `no-store` headers.
- **Sandbox calls:** the adapters accept sandbox hosts only, calls are budgeted in PostgreSQL, and Cloudflare Turnstile can gate them. Credentials never reach the browser.
- **Data:** logs name payouts by internal ID and network reference, not by recipient.
- **Automation:** CI runs every test and boots the packaged container. CodeQL analyses Java and TypeScript with the security-extended queries. Dependabot tracks Maven, npm, Docker and GitHub Actions. The deploy pipeline signs in to Azure with OpenID Connect and stores no cloud credential.
