# Mastercard Send Integration

The payment engine defaults to the deterministic simulated provider. Setting `PAYMENTS_PROVIDER=mastercard` activates an adapter for Mastercard Send Disbursements.

## Published contract used by the adapter

The implementation follows Mastercard's published Java tooling and Disbursements contract:

- Mastercard's OAuth 1.0a Java signer signs every request using a consumer key and PKCS#12 private key.
- Disbursement creation uses the Send Disbursements payment endpoint.
- Reconciliation looks up a disbursement by the client-supplied `disbursement_reference`.
- The payout UUID is used as that stable client reference.
- A deliberate repeat sends the Mastercard Send `repeat-flag: true` header.
- `APPROVED`, `DECLINED`, `UNKNOWN`, `PENDING`, `ERROR`, and `REVERSED` are mapped conservatively into the internal provider state model.

## Current connectivity

Mastercard introduced Regional Network Transit Zone (RNTZ) domains for Mastercard Send and states that new customers should use them.

The default sandbox host is therefore:

```text
https://sandbox.api.move.mastercard.com
```

It can be overridden with `MASTERCARD_BASE_URL`.

## Transaction local time

The adapter includes `transaction_local_date_time` in the `payment_disbursement` object. Mastercard added this field in 2026 for traceability and reconciliation reporting.

## Credentials

Authenticated calls require a Mastercard Developers project and sandbox credentials:

```text
PAYMENTS_PROVIDER=mastercard
MASTERCARD_PARTNER_ID=...
MASTERCARD_CONSUMER_KEY=...
MASTERCARD_P12_PATH=/absolute/path/to/key.p12
MASTERCARD_KEY_ALIAS=...
MASTERCARD_KEY_PASSWORD=...
```

Do not put those values in Git.

The repository contains only public sandbox example account URIs from Mastercard's reference material. Override them if your project supplies different sandbox data.

## Verification boundary

The adapter is compiled and its response mapping is unit-tested in CI. An authenticated end-to-end Mastercard sandbox call requires credentials from a Mastercard Developers project and is not claimed until that call has actually succeeded.

## References

- Mastercard OAuth 1.0a Java signer: https://github.com/Mastercard/oauth1-signer-java
- Mastercard Send Disbursements reference app: https://github.com/Mastercard/send-disbursements-reference-app
- Mastercard Send release notes: https://developer.mastercard.com/mastercard-send/documentation/release-notes/
