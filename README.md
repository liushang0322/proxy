# proxy

Private control panel and deployment bundle for `vpn.lshang.top`.

## What it includes

- A lightweight Node admin panel for:
  - login
  - server and proxy settings
  - family client management
  - Clash Verge subscription generation
  - Shadowrocket import generation
  - sing-box deploy/restart actions
- A file-backed JSON data layer in `runtime/data/state.json`
- A `deploy/` folder with `docker-compose`, `nginx`, and `sing-box` assets

## Local development

```bash
cp .env.example .env
npm install
npm run db:push
npm run dev
```

The panel runs at `http://localhost:3000`.

Default credentials come from `.env`:

- username: `ADMIN_USERNAME`
- password: `ADMIN_PASSWORD`

For servers with slow access to the default npm registry, set:

```bash
NPM_REGISTRY=https://registry.npmmirror.com
```

## Production layout

Expected runtime directories on the server:

- `runtime/data`
- `runtime/generated`
- `runtime/acme-webroot`
- `runtime/letsencrypt`

The main deployment files are in `deploy/`:

- `deploy/docker-compose.yml`
- `deploy/nginx/default.conf`
- `deploy/scripts/init-letsencrypt.sh`
- `deploy/scripts/renew-certs.sh`

## Server bootstrap

1. Point `vpn.lshang.top` to `43.108.35.79`.
2. Copy `.env.example` to `.env` and replace secrets.
3. Create runtime folders:

```bash
bash deploy/scripts/bootstrap-runtime.sh
```

4. Issue the first certificate:

```bash
bash deploy/scripts/init-letsencrypt.sh
```

5. Start the stack:

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

6. Open `https://vpn.lshang.top`.

7. Sign in with the admin credentials from `.env`, then use **Deploy config** once to replace the bootstrap `sing-box` config.

## Certificate renewal

Run this on a cron timer:

```bash
bash deploy/scripts/renew-certs.sh
```

## Notes

- `443/udp` is reserved for Hysteria2.
- `443/tcp` serves the admin panel through `nginx`.
- `8443/tcp` is the Trojan fallback port.
- The panel controls Docker through `/var/run/docker.sock`.
- The new panel removes the heavy `Next.js + Prisma` build step to keep server deployment fast.
