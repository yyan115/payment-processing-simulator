# Mastercard Send Integration

The payment engine defaults to the deterministic simulated provider. Setting `MASTERCARD_ENABLED=true` enables Mastercard Send alongside the simulator. Each payout chooses `simulated` or `mastercard`; that choice is persisted and used for processing, retries and reconciliation. `PAYMENTS_PROVIDER=mastercard` remains available to change the default provider for API clients.

## Published contract used by the adapter

The implementation follows Mastercard's published Java tooling and Disbursements contract:

- Mastercard's OAuth 1.0a Java signer signs every request using a consumer key and PKCS#12 private key.
- Disbursement creation uses the Send Disbursements payment endpoint.
- Reconciliation looks up a disbursement by the client-supplied `disbursement_reference`.
- The payout UUID is used as that stable client reference.
- Internal amounts use major currency units, while Mastercard Send requests are converted to the ISO 4217 currency's smallest unit. For example, `SGD 100.00` is sent as `"10000"`. The adapter also enforces Mastercard Send's published maximum of `999999999999` minor units.
- Sender, recipient, participant, and transaction-purpose details can be supplied through an explicit JSON configuration file. They are omitted when unconfigured; the application never invents identity data.
- A deliberate repeat sends the Mastercard Send `repeat-flag: true` header.
- A documented legacy HTTP 402 response with `ReasonCode=DECLINE` is classified as a business decline. Other non-2XX client responses remain integration failures rather than being mislabeled as issuer declines.
- A reconciliation GET returning HTTP 404 is treated as "no provider record" and preserves the payout's unresolved state.
- `APPROVED`, `DECLINED`, `UNKNOWN`, `PENDING`, `ERROR`, `REVERSED`, and `CANCELLED` are mapped conservatively while a payout is still unresolved. A `REVERSED` or `CANCELLED` result observed before local success resolves the payout as a non-success.

## Current connectivity

Mastercard introduced Regional Network Transit Zone (RNTZ) domains for Mastercard Send and states that new customers should use them.

The default sandbox host is therefore:

```text
https://sandbox.api.move.mastercard.com
```

It can be overridden with `MASTERCARD_BASE_URL`.

## Transaction local time

The adapter supports the optional `transaction_local_date_time` field added in Mastercard Send Release Notes 25.4. When `MASTERCARD_TRANSACTION_TIME_ZONE` is configured, the adapter sends the actual local date and time with its UTC offset. If it is not configured, the field is omitted rather than inventing a location.

## Credentials

Authenticated calls require a Mastercard Developers project with Mastercard Send sandbox access and its generated signing credentials. Sandbox calls have been verified with this application; MTF and production access are separate onboarding steps:

```text
MASTERCARD_ENABLED=true
MASTERCARD_PARTNER_ID=...
MASTERCARD_CONSUMER_KEY=...
MASTERCARD_P12_PATH=/absolute/path/to/key.p12
MASTERCARD_KEY_ALIAS=...
MASTERCARD_KEY_PASSWORD=...
MASTERCARD_SENDER_ACCOUNT_URI=...
MASTERCARD_RECIPIENT_ACCOUNT_URI=...
MASTERCARD_REQUEST_DETAILS_PATH=/absolute/path/to/request-details.json
```

Keep credentials and account configuration outside Git.

`MASTERCARD_REQUEST_DETAILS_PATH` accepts a JSON object containing `sender`, `recipient`, `participant`, and/or `transaction_purpose`. These fields describe the configured sandbox parties; the current adapter uses a fixed recipient account for its test payouts. The file cannot override the payout reference, amount, currency, or account URIs. Invalid shapes and unsupported fields fail startup.

For a reproducible sandbox example, [mastercard-sandbox-parties.json](examples/mastercard-sandbox-parties.json) contains the fictional identities and participant details from [Mastercard's testing guide](https://developer.mastercard.com/mastercard-send-disbursements/documentation/testing/). Use the guide's test account URIs with that file, `BDB`, `DEBIT`, and `USD 53.00`. In the static sandbox, the partner ID can be any valid 32-character value; MTF and production require an assigned partner ID. These sample identities are test fixtures, not production defaults.

Account URIs are deliberately not stored in the repository. The recipient account URI is required by the Disbursements contract.

`sender_account_uri` is not universally required by the schema, so the adapter does not invent one. Mastercard explicitly requires it for disbursements to Mastercard accounts, while some non-Mastercard routes may not require it. The adapter cannot determine that network requirement from an arbitrary configured account URI, so the caller must provide the sender account URI whenever the configured route requires it.

Funding source, origination country, and transaction time zone are also optional adapter settings whose requirements depend on the partner profile and route established during Mastercard onboarding.

The adapter rejects non-sandbox Mastercard hosts even if a production URL is supplied. This repository is not intended to move production money.

## Run both views with Docker

Keep the credential values in your shell or an ignored `.env` file. Set `MASTERCARD_P12_BASE64` to the base64-encoded contents of your sandbox signing key; the container decodes it privately at startup. Supply the key alias/password, consumer key, 32-character sandbox partner ID, and official sender/recipient test account URIs.

```bash
docker compose -f docker-compose.yml -f docker-compose.mastercard.yml up --build
```

Open http://localhost:8080 and select **Mastercard sandbox**. The UI starts with the published test recipient and USD 53.00. Create and send a payout, inspect its ledger, then use **Check Mastercard** for a separate signed lookup. The simulator remains available in the same workspace. Cloud configuration is described in [Deployment](deployment.md).

The browser’s recipient name is a display reference. The adapter uses its configured fixed sandbox recipient account; this is not a general-purpose payout form for arbitrary recipients. The browser does not collect card data or signing credentials.

## Decline response behavior

Mastercard Send historically returns transaction declines as HTTP 402 with `ReasonCode=DECLINE`. Release 24.1 introduced the optional `decline_details` request parameter, which can instead return declines as 2XX responses with `status=DECLINED` and additional network decline information.

The adapter handles both the normal 2XX `DECLINED` status and the documented legacy 402 `DECLINE` error structure. It does not currently force the optional `decline_details` parameter.

## Reversal boundary

The adapter does not claim post-success reversal accounting. Once a payout has been confirmed locally and its immutable journal has been posted, a later provider reversal cannot be represented by rewriting that payout or deleting its journal. Correct support would require a separate reversal resource/state transition and compensating debit/credit entries linked to the original payout.

This boundary is intentional. It preserves the historical fact that the original payout was once approved while leaving a clear path for a future reversal subsystem.

## Verification boundary

On 2026-09-27, the application completed an authenticated Mastercard Send static-sandbox payout using a unique payout UUID and the official test parties:

- The Java/Spring backend submitted USD 53.00 and recorded `SUCCEEDED` with the returned provider transaction ID.
- A signed lookup by that UUID returned HTTP 200, `APPROVED`, and the same provider transaction ID.
- The same workflow also passed through the browser’s Mastercard view, with server-side signing and explicit provider lookup.
- The local payout had one balanced journal with a USD 53.00 debit and credit.
- Reusing the creation idempotency key returned the original payout. Reprocessing the succeeded payout returned HTTP 409 and left the journal unchanged.
- A later network connection timeout left the original payout `UNKNOWN`; a successful lookup found no matching record, and a safe repeat using that same payout UUID completed as `SUCCEEDED`.
- A preceding incomplete-payload attempt received a sandbox HTTP 500; the backend preserved `UNKNOWN` and created no ledger entry.

Mastercard's published happy-path request and a full request with a fresh UUID also returned HTTP 201 / `APPROVED`. Authentication, sandbox request compatibility, lookup, and local accounting are verified. The sandbox returns simulated provider responses: this does not prove production settlement, MTF readiness, live funds movement, or every failure/repeat scenario against Mastercard.

CI tests use generated RSA keys and local fixtures, not live credentials. They cover provider startup, signed request paths, repeat headers, response mapping, request details, and sandbox-host enforcement. The live check exposed and fixed a constructor-injection defect, a lookup path incorrectly targeting MTF, and missing configuration for the documented party details.

## References

- Mastercard OAuth 1.0a Java signer: https://github.com/Mastercard/oauth1-signer-java
- Mastercard Send Disbursements reference app: https://github.com/Mastercard/send-disbursements-reference-app
- Mastercard Send release notes: https://developer.mastercard.com/mastercard-send/documentation/release-notes/
- Mastercard Send Release Notes 25.1: https://static.developer.mastercard.com/content/mastercard-send/release-notes/mastercard-send-release-notes-25.1.pdf
- Mastercard Send Release Notes 25.4: https://static.developer.mastercard.com/content/mastercard-send/release-notes/mastercard-send-release-notes-25.4.pdf
