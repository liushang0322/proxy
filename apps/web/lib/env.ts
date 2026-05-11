const env = {
  appDomain: process.env.APP_DOMAIN ?? "vpn.lshang.top",
  serverIp: process.env.SERVER_IP ?? "43.108.35.79",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-session-secret",
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin123456",
  databaseUrl: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  runtimeDir: process.env.RUNTIME_DIR ?? process.cwd(),
  certificatePath:
    process.env.CERTIFICATE_PATH ??
    "/etc/letsencrypt/live/vpn.lshang.top/fullchain.pem",
  privateKeyPath:
    process.env.PRIVATE_KEY_PATH ??
    "/etc/letsencrypt/live/vpn.lshang.top/privkey.pem",
  singboxContainerName: process.env.SINGBOX_CONTAINER_NAME ?? "sing-box"
};

export default env;

