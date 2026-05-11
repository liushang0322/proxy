#!/usr/bin/env bash
set -euo pipefail

DOMAIN="vpn.lshang.top"
EMAIL="${LETSENCRYPT_EMAIL:-admin@lshang.top}"
WEBROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/runtime/acme-webroot"
LE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/runtime/letsencrypt"

mkdir -p "$WEBROOT" "$LE_ROOT"

docker run --rm \
  -p 80:80 \
  -v "$LE_ROOT:/etc/letsencrypt" \
  certbot/certbot:latest certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$DOMAIN"

echo "Certificate issued for $DOMAIN"

