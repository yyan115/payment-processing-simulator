# Mastercard sandbox

`MASTERCARD_ENABLED=true` enables Mastercard Send alongside the simulated provider. Each payout stores its provider selection and uses the same state machine, audit and ledger.

## Configure

Create a Mastercard Developers project with Mastercard Send sandbox access and generated signing credentials. Keep these settings outside Git:

```dotenv
MASTERCARD_ENABLED=true
MASTERCARD_PARTNER_ID=<32-character sandbox ID>
MASTERCARD_CONSUMER_KEY=<consumer key>
MASTERCARD_P12_PATH=/private/path/key.p12
MASTERCARD_KEY_ALIAS=<alias>
MASTERCARD_KEY_PASSWORD=<password>
MASTERCARD_SENDER_ACCOUNT_URI=<official test account>
MASTERCARD_RECIPIENT_ACCOUNT_URI=<official test account>
MASTERCARD_FUNDING_SOURCE=DEBIT
MASTERCARD_PAYMENT_ORIGINATION_COUNTRY=USA
MASTERCARD_REQUEST_DETAILS_PATH=/private/path/request-details.json
```

For Docker/hosting, use `MASTERCARD_P12_BASE64` instead of a local key path. The entrypoint decodes it into a private temporary file. [Deployment](deployment.md) covers hosted settings and optional bot verification.

[mastercard-sandbox-parties.json](examples/mastercard-sandbox-parties.json) contains fictional parties from [Mastercard’s testing guide](https://developer.mastercard.com/mastercard-send-disbursements/documentation/testing/). Use its official test account URIs, `BDB`, `DEBIT` and USD 53.00. The static sandbox accepts a valid-length partner ID; production onboarding is separate.

The details file may contain `sender`, `recipient`, `participant` and `transaction_purpose`. It cannot override the amount, currency, reference or configured account URIs. Invalid fields fail startup.

Recipient account URI is required. Sender account URI and other route fields depend on Mastercard’s network/program requirements; the adapter does not invent missing account or identity information.

## Run

```bash
docker compose -f docker-compose.yml -f docker-compose.mastercard.yml up --build
```

Select **Mastercard sandbox** in the provider field and **Send payment**. The workflow submits the payment, checks its status and tests creation-request replay automatically. Participant names are display labels for fixed sandbox accounts, not arbitrary card recipients. No card data or credentials are collected in the browser.

## API behavior

- Mastercard’s official OAuth 1.0a library signs requests with the private key and consumer key.
- Default host: `https://sandbox.api.move.mastercard.com`; production hosts are rejected.
- Creation: `/send/static/v1/partners/{partnerId}/disbursements/payment`.
- Lookup: `/send/static/v1/partners/{partnerId}/disbursements?ref={payoutUUID}`.
- Amounts convert to ISO currency minor units without rounding. Stable references survive repeats, which set `Repeat-Flag: true`.
- Normal `DECLINED` and documented legacy HTTP 402 `ReasonCode=DECLINE` become business declines. Other HTTP failures preserve uncertainty.
- Lookup 404, `PENDING` and `UNKNOWN` do not establish failure. Reversed/cancelled outcomes can resolve an unresolved payment as non-success; post-success reversal accounting is outside scope.
- Optional `MASTERCARD_TRANSACTION_TIME_ZONE` adds the actual local transaction timestamp and UTC offset.

## Verification

On **2026-10-02**, the public browser workflow submitted USD 53.00 through the authenticated sandbox adapter and posted one balanced journal. The automatic reference lookup completed successfully.

On **2026-09-27**, authenticated local Java and browser workflows submitted USD 53.00, received approval, retrieved the same transaction by reference, posted one balanced journal, and returned the original payment on idempotent replay. A safe repeat also recovered a timed-out request. An earlier incomplete request preserved `UNKNOWN` without a journal.

The static sandbox returns simulated responses. This verifies signing and sandbox compatibility, not production settlement, MTF readiness or all Mastercard failure scenarios. CI uses generated keys and local contract fixtures; live credentials are never required. Current public verification is recorded in [Deployment](deployment.md).

[Quick start](https://developer.mastercard.com/mastercard-send-disbursements/documentation/quick-start-guide/) · [API reference](https://developer.mastercard.com/mastercard-send-disbursements/documentation/api-reference/) · [Java signer](https://github.com/Mastercard/oauth1-signer-java)
