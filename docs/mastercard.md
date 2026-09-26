# Mastercard Send Integration

The payment engine defaults to the deterministic simulated provider. Setting `PAYMENTS_PROVIDER=mastercard` activates an adapter for Mastercard Send Disbursements.

## Published contract used by the adapter

The implementation follows Mastercard's published Java tooling and Disbursements contract:

- Mastercard's OAuth 1.0a Java signer signs every request using a consumer key and PKCS#12 private key.
- Disbursement creation uses the Send Disbursements payment endpoint.
- Reconciliation looks up a disbursement by the client-supplied `disbursement_reference`.
- The payout UUID is used as that stable client reference.
- A deliberate repeat sends the Mastercard Send `repeat-flag: true` header.
- `APPROVED`, `DECLINED`, `UNKNOWN`, `PENDING`, `ERROR`, `REVERSED`, and `CANCELLED` are mapped conservatively into the internal provider state model.

## Current connectivity

Mastercard introduced Regional Network Transit Zone (RNTZ) domains for Mastercard Send and states that new customers should use them.

The default sandbox host is therefore:

```text
https://sandbox.api.move.mastercard.com
```

It can be overridden with `MASTERCARD_BASE_URL`.

## Transaction local time

The adapter includes `transaction_local_date_time` in the `payment_disbursement` object. Mastercard specifies that this must represent the actual local date and time at the point of transaction acceptance, including its UTC offset. The sandbox fixture therefore uses `USA` with the `America/Chicago` time zone; both are configurable and should be kept consistent.

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

Sender and recipient account URIs are deliberately not stored in the repository. Configure the sandbox values supplied for your Mastercard Developers project.

The adapter rejects non-sandbox Mastercard hosts even if a production URL is supplied. This repository is not intended to move production money.

## Verification boundary

CI verifies the adapter with generated RSA keys and a local HTTP contract fixture, including OAuth signing, Mastercard paths, `repeat-flag`, request payloads, lookup-by-reference, sandbox-host enforcement, and response mapping. An authenticated end-to-end Mastercard sandbox call still requires Mastercard-issued credentials and is not claimed until that call has actually succeeded.

## References

- Mastercard OAuth 1.0a Java signer: https://github.com/Mastercard/oauth1-signer-java
- Mastercard Send Disbursements reference app: https://github.com/Mastercard/send-disbursements-reference-app
- Mastercard Send release notes: https://developer.mastercard.com/mastercard-send/documentation/release-notes/
- Mastercard Send Release Notes 25.1: https://static.developer.mastercard.com/content/mastercard-send/release-notes/mastercard-send-release-notes-25.1.pdf
- Mastercard Send Release Notes 25.4: https://static.developer.mastercard.com/content/mastercard-send/release-notes/mastercard-send-release-notes-25.4.pdf
