#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

mkdir -p \
  "$ROOT_DIR/runtime/data" \
  "$ROOT_DIR/runtime/generated" \
  "$ROOT_DIR/runtime/acme-webroot" \
  "$ROOT_DIR/runtime/letsencrypt"

if [ ! -f "$ROOT_DIR/runtime/generated/sing-box.json" ]; then
  cat >"$ROOT_DIR/runtime/generated/sing-box.json" <<'JSON'
{
  "log": {
    "level": "info",
    "timestamp": true
  },
  "inbounds": [
    {
      "type": "trojan",
      "tag": "bootstrap",
      "listen": "::",
      "listen_port": 8443,
      "users": [
        {
          "name": "bootstrap",
          "password": "replace-me-from-panel"
        }
      ],
      "tls": {
        "enabled": true,
        "server_name": "vpn.lshang.top",
        "certificate_path": "/etc/letsencrypt/live/vpn.lshang.top/fullchain.pem",
        "key_path": "/etc/letsencrypt/live/vpn.lshang.top/privkey.pem"
      }
    }
  ],
  "outbounds": [
    {
      "type": "direct",
      "tag": "direct"
    }
  ]
}
JSON
fi

echo "Runtime directories are ready at $ROOT_DIR/runtime"

