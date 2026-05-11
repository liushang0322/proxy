import { db } from "@/lib/db";
import { ensureDefaultData } from "@/lib/bootstrap";
import { getDockerStatus } from "@/lib/docker";
import { fileExists, readDeployMetadata } from "@/lib/runtime";

export async function getSettingsSnapshot() {
  await ensureDefaultData();

  const [server, proxy, clients] = await Promise.all([
    db.serverSettings.findUniqueOrThrow({ where: { id: 1 } }),
    db.proxyProfile.findUniqueOrThrow({ where: { id: 1 } }),
    db.clientProfile.findMany({ orderBy: { createdAt: "asc" } })
  ]);

  return { server, proxy, clients };
}

export async function getDashboardData() {
  const snapshot = await getSettingsSnapshot();
  const [docker, certificatePresent, privateKeyPresent, deployMeta] = await Promise.all([
    getDockerStatus(),
    fileExists(snapshot.server.certificatePath),
    fileExists(snapshot.server.privateKeyPath),
    readDeployMetadata()
  ]);

  return {
    ...snapshot,
    status: {
      docker,
      certificatePresent,
      privateKeyPresent,
      lastDeployAt: deployMeta?.updatedAt ?? null
    }
  };
}

