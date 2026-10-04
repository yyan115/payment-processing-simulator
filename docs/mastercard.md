# Mastercard Send sandbox

Set `MASTERCARD_ENABLED=true` to add Mastercard Send next to the simulated network. A Mastercard payout uses the same state machine, audit trail and ledger as any other.

## Configure

Create a project on Mastercard Developers with Mastercard Send sandbox access and generate a signing key. Keep these outside Git:

```dotenv
MASTERCARD_ENABLED=true
MASTERCARD_PARTNER_ID=<32-character sandbox ID>
MASTERCARD_CONSUMER_KEY=<consumer key>
MASTERCARD_KEY_ALIAS=<key alias>
MASTERCARD_KEY_PASSWORD=<key password>
MASTERCARD_P12_PATH=/private/path/key.p12      # or MASTERCARD_P12_BASE64 in containers
MASTERCARD_SENDER_ACCOUNT_URI=<test account URI>
MASTERCARD_RECIPIENT_ACCOUNT_URI=<test account URI>
MASTERCARD_FUNDING_SOURCE=DEBIT
MASTERCARD_PAYMENT_ORIGINATION_COUNTRY=USA
MASTERCARD_REQUEST_DETAILS_PATH=docs/examples/mastercard-sandbox-parties.json
```

In a container, pass the key as `MASTERCARD_P12_BASE64`. The entrypoint decodes it into a private temporary file at startup.

[`mastercard-sandbox-parties.json`](examples/mastercard-sandbox-parties.json) holds the fictional sender and recipient from [Mastercard's testing guide](https://developer.mastercard.com/mastercard-send-disbursements/documentation/testing/). It may set `sender`, `recipient`, `participant` and `transaction_purpose`. It cannot override the amount, currency, reference or account URIs, and an invalid field stops startup. The static sandbox accepts any partner ID of the right length. Production onboarding is separate.

## Run

```bash
docker compose -f docker-compose.yml -f docker-compose.mastercard.yml up --build
```

Choose **Mastercard API sandbox** as the payment network and send. The page does not collect card data. Every sandbox payment uses the same fixed test accounts, whatever names are chosen on the page.

## How the adapter behaves

- **Signing:** Mastercard's OAuth 1.0a library signs each request with the consumer key and the private key.
- **Hosts:** `https://sandbox.api.move.mastercard.com` only. Any other host is rejected.
- **Create:** `POST /send/static/v1/partners/{partnerId}/disbursements/payment`.
- **Look up:** `GET /send/static/v1/partners/{partnerId}/disbursements?ref={payout id}`.
- **Resend:** the same reference with `Repeat-Flag: true`.
- **Amounts:** converted to minor units for the currency, without rounding.
- **Declines:** `DECLINED`, and the older HTTP 402 with `ReasonCode=DECLINE`, become `FAILED`. Other HTTP errors keep the payout `UNKNOWN`.
- **Lookups:** 404, `PENDING` and `UNKNOWN` do not prove a failure, so the payout stays `UNKNOWN`. A reversed or cancelled result can resolve an `UNKNOWN` payout as failed.
- **Time zone:** `MASTERCARD_TRANSACTION_TIME_ZONE` adds the local transaction time and UTC offset.

## Tests

CI uses generated keys and local contract fixtures, so it needs no credentials. A live run is opt-in:

```bash
cd frontend && MASTERCARD_E2E=true npm run test:e2e -- --grep 'authenticated Mastercard'
```

The sandbox returns simulated responses. This checks signing and request shape, not production settlement or every Mastercard failure.

[Quick start](https://developer.mastercard.com/mastercard-send-disbursements/documentation/quick-start-guide/) · [API reference](https://developer.mastercard.com/mastercard-send-disbursements/documentation/api-reference/) · [Java signer](https://github.com/Mastercard/oauth1-signer-java)
