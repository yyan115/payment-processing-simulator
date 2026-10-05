#!/bin/sh
set -eu
# Hosted secret stores can supply the binary signing key as base64.
# Decode at runtime only, so neither form is part of the image.
if [ -n "${MASTERCARD_P12_BASE64:-}" ]; then
    umask 077
    printf '%s' "$MASTERCARD_P12_BASE64" | base64 -d > /tmp/mastercard-sandbox.p12
    export MASTERCARD_P12_PATH=/tmp/mastercard-sandbox.p12
    unset MASTERCARD_P12_BASE64
fi
exec java -jar /app/app.jar
