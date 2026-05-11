import crypto from "node:crypto";

import { db } from "@/lib/db";
import env from "@/lib/env";
import { ensureDefaultAdmin } from "@/lib/auth";

function randomSecret(size = 18) {
  return crypto.randomBytes(size).toString("base64url");
}

export async function ensureDefaultData() {
  await ensureDefaultAdmin();

  const serverSettings = await db.serverSettings.findUnique({ where: { id: 1 } });
  if (!serverSettings) {
    await db.serverSettings.create({
      data: {
        id: 1,
        domain: env.appDomain,
        serverIp: env.serverIp,
        certificatePath: env.certificatePath,
        privateKeyPath: env.privateKeyPath,
        panelPort: 443,
        hysteriaPort: 443,
        trojanPort: 8443
      }
    });
  }

  const proxyProfile = await db.proxyProfile.findUnique({ where: { id: 1 } });
  if (!proxyProfile) {
    await db.proxyProfile.create({
      data: {
        id: 1,
        hy2ObfsPassword: randomSecret(),
        hy2UpMbps: 100,
        hy2DownMbps: 100,
        enableTrojan: true,
        masqueradeUrl: "https://www.apple.com"
      }
    });
  }

  const clients = await db.clientProfile.count();
  if (clients === 0) {
    await db.clientProfile.create({
      data: {
        name: "owner",
        displayName: "Owner",
        token: randomSecret(),
        hy2Password: randomSecret(),
        trojanPassword: randomSecret(),
        enabled: true
      }
    });
  }
}

export async function generateClientSecrets() {
  return {
    token: randomSecret(),
    hy2Password: randomSecret(),
    trojanPassword: randomSecret()
  };
}

