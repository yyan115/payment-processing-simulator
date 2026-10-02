# Visa Direct sandbox

`VISA_ENABLED=true` adds Visa Direct as a payment network next to the simulator and Mastercard Send. Each payout stores its provider and uses the same state machine, audit and ledger.

## What it calls

- **Pay:** Visa Direct "push funds" (`POST /visadirect/fundstransfer/v1/pushfundstransactions`), an Original Credit Transaction that pays a card. Action code `00` is an approval and is recorded as `SUCCEEDED`. A decline code is `FAILED`. Codes `68`, `91` and `96` mean the issuer or network could not answer, so the payment stays `UNKNOWN`.
- **Look up:** the transaction query (`GET /visadirect/v1/transactionquery`), by acquiring BIN and transaction identifier.
- **Matching:** Visa finds a payment by its identifiers. The transaction identifier, retrieval reference number and trace audit number are derived from the payout reference. A resend therefore carries the same identifiers and Visa can recognise it as the same payment.

## Security Visa requires

- **Two-way SSL:** every request presents the certificate Visa issued to the project.
- **User ID and password:** sent with every request.
- **Message Level Encryption:** request bodies are JWE (RSA-OAEP-256 key wrapping, A128GCM content encryption) encrypted to Visa's server certificate. Replies arrive encrypted to the project's encryption certificate and are decrypted on the server. All of this stays in the backend. The adapter accepts `sandbox.api.visa.com` only.

## Configure

Create a project on the Visa Developer Platform with the **Visa Direct** product, then take the sandbox credentials from the project dashboard:

1. Credentials, Two-Way SSL: add a credential with "Generate a CSR for me", save the private key (it is shown once), and download the certificate. The user ID and password appear when the row is expanded.
2. Message Level Encryption: generate a key ID, add a CSR the same way, and download the client and server certificates.

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

Encode a file with `base64 -w0 file.pem`. Visa's key files may arrive without line breaks, and the adapter reads them either way. Never commit these values.

Optional settings use Visa's published sandbox test values by default: `VISA_ACQUIRING_BIN` (408999), `VISA_RECIPIENT_PAN` (a Visa test card), `VISA_SENDER_ACCOUNT_NUMBER` and `VISA_BUSINESS_APPLICATION_ID` (`MD`, merchant disbursement).

```bash
docker compose -f docker-compose.yml -f docker-compose.visa.yml up --build
```

Add `-f docker-compose.mastercard.yml` to enable both external networks.

## Limits

This is sandbox integration, not production settlement. Visa requires program approval, certification testing and settlement handling before production. The recipient is a Visa test card, so names on the page are labels only.
