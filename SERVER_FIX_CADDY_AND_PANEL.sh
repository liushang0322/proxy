#!/usr/bin/env bash
set -euo pipefail

echo "[1/6] Detect vpn-web Docker network"
WEBNET="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' vpn-web | head -n1)"
echo "WEBNET=$WEBNET"

echo "[2/6] Connect caddy into vpn-web network"
docker network connect "$WEBNET" caddy 2>/dev/null || true

echo "[3/6] Rewrite /opt/caddy/Caddyfile"
cat >/opt/caddy/Caddyfile <<'EOF'
{
    email 821453661@qq.com
}

chat.lshang.top {
    reverse_proxy open-webui:8080
}

api.lshang.top {
    reverse_proxy sub2api:8080
}

register.lshang.top {
    reverse_proxy register-nginx:80
}

vpn.lshang.top {
    reverse_proxy vpn-web:3000
}
EOF

echo "[4/6] Validate and reload caddy"
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile

echo "[5/6] Verify caddy can reach vpn-web internally"
docker exec caddy sh -lc 'wget -S -O- http://vpn-web:3000/login >/dev/null'

echo "[6/6] Verify external HTTPS route"
curl --resolve vpn.lshang.top:443:127.0.0.1 -kI https://vpn.lshang.top

echo
echo "If the last command returns HTTP/2 200 or HTTP/2 302, the panel route is fixed."
