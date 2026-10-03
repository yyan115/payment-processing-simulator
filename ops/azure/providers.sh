#!/usr/bin/env bash
# Stores the Mastercard and Visa sandbox credentials from an ignored .env file as
# Container App secrets and turns both providers on. Run after deploy.sh.
set -euo pipefail
RG=${RG:-payment-simulator}
APP=${APP:-payment-simulator}
ENV_FILE=${ENV_FILE:-$(dirname "$0")/../../.env}
SECRET_KEYS="MASTERCARD_PARTNER_ID MASTERCARD_CONSUMER_KEY MASTERCARD_P12_BASE64 MASTERCARD_KEY_ALIAS
MASTERCARD_KEY_PASSWORD MASTERCARD_SENDER_ACCOUNT_URI MASTERCARD_RECIPIENT_ACCOUNT_URI VISA_USER_ID
VISA_PASSWORD VISA_CERT_PEM_BASE64 VISA_KEY_PEM_BASE64 VISA_MLE_KEY_ID VISA_MLE_SERVER_CERT_BASE64
VISA_MLE_PRIVATE_KEY_BASE64"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

secrets=()
refs=()
for key in $SECRET_KEYS; do
  name=$(echo "$key" | tr 'A-Z_' 'a-z-')
  secrets+=("$name=${!key:?$key is missing from $ENV_FILE}")
  refs+=("$key=secretref:$name")
done
az containerapp secret set --name "$APP" --resource-group "$RG" --secrets "${secrets[@]}" --output none
az containerapp update --name "$APP" --resource-group "$RG" --output none --set-env-vars \
  "${refs[@]}" MASTERCARD_ENABLED=true VISA_ENABLED=true MASTERCARD_FUNDING_SOURCE=DEBIT \
  MASTERCARD_PAYMENT_ORIGINATION_COUNTRY=USA \
  MASTERCARD_REQUEST_DETAILS_PATH=/app/examples/mastercard-sandbox-parties.json
