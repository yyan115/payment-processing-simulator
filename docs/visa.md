# Visa Direct sandbox

Set `VISA_ENABLED=true` to add Visa Direct next to the simulated network and Mastercard Send. A Visa payout uses the same state machine, audit trail and ledger as any other.

## What it calls

- **Pay:** push funds, `POST /visadirect/fundstransfer/v1/pushfundstransactions`, an Original Credit Transaction that pays a card. Action code `00` is an approval and becomes `SUCCEEDED`. A decline code becomes `FAILED`. Codes `68`, `91` and `96` mean the issuer or network could not answer, so the payout stays `UNKNOWN`.
- **Look up:** the transaction query, `GET /visadirect/v1/transactionquery`, by acquiring BIN and transaction identifier.
- **Matching:** Visa finds a payment by its identifiers. The transaction identifier, retrieval reference number and trace audit number are derived from the payout's reference, so a resend carries the same identifiers and Visa recognises the same payment. The retrieval reference number has a required shape: a year digit, a day of the year from 001 to 366, then eight digits.

## What Visa requires

- **Two-way SSL:** every request presents the certificate Visa issued to the project.
- **User ID and password:** sent with every request.
- **Message Level Encryption:** request bodies are JWE, using RSA-OAEP-256 key wrapping and A128GCM, encrypted to Visa's server certificate. Replies are encrypted to the project's certificate and decrypted on the server.

All of this stays on the server, and the adapter accepts `sandbox.api.visa.com` only.

## Configure

Create a project on the Visa Developer Platform with the **Visa Direct** product, then take the sandbox credentials from the project dashboard:

1. **Credentials, Two-Way SSL:** add a credential with "Generate a CSR for me", save the private key (it is shown once) and download the certificate. The user ID and password appear when the row is expanded.
2. **Message Level Encryption:** generate a key ID, add a CSR the same way, and download the client and server certificates.

```dotenv
VISA_ENABLED=true
VISA_USER_ID=<user ID>
VISA_PASSWORD=<password>
VISA_CERT_PEM_BASE64=<base64 of the two-way SSL certificate>
VISA_KEY_PEM_BASE64=<base64 of its private key>
VISA_MLE_KEY_ID=<key ID>
VISA_MLE_SERVER_CERT_BASE64=<base64 of Visa's server certificate>
VISA_MLE_PRIVATE_KEY_BASE64=<base64 of the encryption private key>
```

Encode a file with `base64 -w0 file.pem`. Visa's key files can arrive without line breaks, and the adapter reads them either way. Optional settings default to Visa's published sandbox values: `VISA_ACQUIRING_BIN` (408999), `VISA_RECIPIENT_PAN` (a Visa test card), `VISA_SENDER_ACCOUNT_NUMBER` and `VISA_BUSINESS_APPLICATION_ID` (`MD`, merchant disbursement).

```bash
docker compose -f docker-compose.yml -f docker-compose.visa.yml up --build
```

Add `-f docker-compose.mastercard.yml` to enable both networks.

## Limits

This is a sandbox integration, not production settlement. Visa requires program approval, certification and settlement handling before production. Every payment goes to the same Visa test card, whatever names are chosen on the page.

A live run is opt-in: `cd frontend && VISA_E2E=true npm run test:e2e -- --grep 'authenticated Visa'`.
