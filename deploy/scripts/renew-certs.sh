#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEBROOT="$ROOT_DIR/runtime/acme-webroot"
LE_ROOT="$ROOT_DIR/runtime/letsencrypt"

mkdir -p "$WEBROOT" "$LE_ROOT"

docker run --rm \
  -v "$LE_ROOT:/etc/letsencrypt" \
  -v "$WEBROOT:/var/www/certbot" \
  certbot/certbot:latest renew --webroot -w /var/www/certbot

docker compose -f "$ROOT_DIR/deploy/docker-compose.yml" exec nginx nginx -s reload

