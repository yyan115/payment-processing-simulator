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

## Automated checks

GitHub Actions runs the test suite on pushes and pull requests. CodeQL performs Java static security analysis using the security-extended query suite. Dependabot tracks Maven, Docker, and GitHub Actions dependencies.
