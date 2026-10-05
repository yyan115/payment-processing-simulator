#!/usr/bin/env bash
# Deploys the published image to Azure Container Apps with a managed PostgreSQL
# Flexible Server. Run `az login` first. Safe to run again.
# It tries each allowed region until the database can be created and saves the generated
# database password to the credentials file below.
set -euo pipefail
RG=${RG:-payment-simulator}
LOCATIONS=${LOCATIONS:-"eastasia japaneast malaysiawest indonesiacentral uaenorth"}
ENVIRONMENT=${ENVIRONMENT:-payment-simulator-env}
APP=${APP:-payment-simulator}
IMAGE=${IMAGE:-ghcr.io/yyan115/payment-processing-simulator:latest}
DB_VERSION=${DB_VERSION:-17}
CREDENTIALS=${CREDENTIALS:-$HOME/.config/payment-processing-simulator/azure/credentials.env}

for provider in Microsoft.App Microsoft.OperationalInsights Microsoft.DBforPostgreSQL; do
  az provider register --namespace "$provider" --wait
done

mkdir -p "$(dirname "$CREDENTIALS")"
if [ ! -f "$CREDENTIALS" ]; then
  umask 077
  printf 'DB_ADMIN=paymentadmin\nDB_PASSWORD=%s\nDB_SERVER=payments-%s\n' \
    "$(openssl rand -hex 20)A1" "$(openssl rand -hex 3)" > "$CREDENTIALS"
fi
# shellcheck disable=SC1090
. "$CREDENTIALS"

LOCATION=$(az group show --name "$RG" --query location --output tsv 2>/dev/null || true)
if [ -z "$LOCATION" ]; then
  for candidate in $LOCATIONS; do
    az group create --name "$RG" --location "$candidate" --output none
    if az postgres flexible-server create --resource-group "$RG" --name "$DB_SERVER" \
        --location "$candidate" --tier Burstable --sku-name Standard_B1ms --storage-size 32 \
        --version "$DB_VERSION" --admin-user "$DB_ADMIN" --admin-password "$DB_PASSWORD" \
        --public-access 0.0.0.0 --yes --output none; then
      LOCATION=$candidate
      break
    fi
    echo "PostgreSQL is not available in $candidate, trying the next region" >&2
    az group delete --name "$RG" --yes --output none
  done
  [ -n "$LOCATION" ] || { echo "No allowed region could host the database" >&2; exit 1; }
fi

az postgres flexible-server db create --resource-group "$RG" --server-name "$DB_SERVER" \
  --name payments --output none
DB_HOST=$(az postgres flexible-server show --resource-group "$RG" --name "$DB_SERVER" \
  --query fullyQualifiedDomainName --output tsv)

if ! az containerapp env show --name "$ENVIRONMENT" --resource-group "$RG" >/dev/null 2>&1; then
  az containerapp env create --name "$ENVIRONMENT" --resource-group "$RG" --location "$LOCATION" --output none
fi

ENV_VARS=(
  "SPRING_DATASOURCE_URL=jdbc:postgresql://$DB_HOST:5432/payments?sslmode=require"
  "SPRING_DATASOURCE_USERNAME=$DB_ADMIN"
  "SPRING_DATASOURCE_PASSWORD=secretref:db-password"
  "DEMO_ENABLED=true"
  "RECONCILIATION_ENABLED=false"
  "PORT=8080"
)
if az containerapp show --name "$APP" --resource-group "$RG" >/dev/null 2>&1; then
  az containerapp secret set --name "$APP" --resource-group "$RG" --secrets "db-password=$DB_PASSWORD" --output none
  az containerapp update --name "$APP" --resource-group "$RG" --image "$IMAGE" \
    --set-env-vars "${ENV_VARS[@]}" --output none
else
  az containerapp create --name "$APP" --resource-group "$RG" --environment "$ENVIRONMENT" \
    --image "$IMAGE" --ingress external --target-port 8080 \
    --cpu 0.25 --memory 0.5Gi --min-replicas 1 --max-replicas 1 \
    --secrets "db-password=$DB_PASSWORD" --env-vars "${ENV_VARS[@]}" --output none
fi
az containerapp show --name "$APP" --resource-group "$RG" \
  --query properties.configuration.ingress.fqdn --output tsv
