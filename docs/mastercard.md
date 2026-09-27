# Mastercard Send Integration

The payment engine defaults to the deterministic simulated provider. Setting `PAYMENTS_PROVIDER=mastercard` activates an adapter for Mastercard Send Disbursements.

## Published contract used by the adapter

The implementation follows Mastercard's published Java tooling and Disbursements contract:

- Mastercard's OAuth 1.0a Java signer signs every request using a consumer key and PKCS#12 private key.
- Disbursement creation uses the Send Disbursements payment endpoint.
- Reconciliation looks up a disbursement by the client-supplied `disbursement_reference`.
- The payout UUID is used as that stable client reference.
- Internal amounts use major currency units, while Mastercard Send requests are converted to the ISO 4217 currency's smallest unit. For example, `SGD 100.00` is sent as `"10000"`. The adapter also enforces Mastercard Send's published maximum of `999999999999` minor units.
- Onboarding-dependent `participant`, sender identity, and recipient identity fields are deliberately omitted from the default request instead of inventing customer data or assuming optional features are enabled.
- A deliberate repeat sends the Mastercard Send `repeat-flag: true` header.
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

Authenticated calls require a Mastercard Developers project, access to the relevant Mastercard Send service, and sandbox credentials. Mastercard Send is financial-transfer infrastructure intended for specific customer/program types, so credential availability depends on Mastercard granting that access:

```text
PAYMENTS_PROVIDER=mastercard
MASTERCARD_PARTNER_ID=...
MASTERCARD_CONSUMER_KEY=...
MASTERCARD_P12_PATH=/absolute/path/to/key.p12
MASTERCARD_KEY_ALIAS=...
MASTERCARD_KEY_PASSWORD=...
MASTERCARD_SENDER_ACCOUNT_URI=...
MASTERCARD_RECIPIENT_ACCOUNT_URI=...
```

Do not put those values in Git.

Account URIs are deliberately not stored in the repository. The recipient account URI is required by the Disbursements contract. Sender account, funding source, origination country, and transaction time zone are optional adapter settings because their requirements depend on the partner profile established during Mastercard onboarding.

The adapter rejects non-sandbox Mastercard hosts even if a production URL is supplied. This repository is not intended to move production money.

## Reversal boundary

The adapter does not claim post-success reversal accounting. Once a payout has been confirmed locally and its immutable journal has been posted, a later provider reversal cannot be represented by rewriting that payout or deleting its journal. Correct support would require a separate reversal resource/state transition and compensating debit/credit entries linked to the original payout.

This boundary is intentional. It preserves the historical fact that the original payout was once approved while leaving a clear path for a future reversal subsystem.

## Verification boundary

CI verifies the adapter with generated RSA keys and a local HTTP contract fixture, including OAuth signing, Mastercard paths, `repeat-flag`, request payloads, lookup-by-reference, sandbox-host enforcement, and response mapping. An authenticated end-to-end Mastercard sandbox call still requires Mastercard-issued credentials and is not claimed until that call has actually succeeded.

## References

- Mastercard OAuth 1.0a Java signer: https://github.com/Mastercard/oauth1-signer-java
- Mastercard Send Disbursements reference app: https://github.com/Mastercard/send-disbursements-reference-app
- Mastercard Send release notes: https://developer.mastercard.com/mastercard-send/documentation/release-notes/
- Mastercard Send Release Notes 25.1: https://static.developer.mastercard.com/content/mastercard-send/release-notes/mastercard-send-release-notes-25.1.pdf
- Mastercard Send Release Notes 25.4: https://static.developer.mastercard.com/content/mastercard-send/release-notes/mastercard-send-release-notes-25.4.pdf
