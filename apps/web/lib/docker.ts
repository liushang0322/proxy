import Docker from "dockerode";

import env from "@/lib/env";

function getDocker() {
  return new Docker({ socketPath: "/var/run/docker.sock" });
}

export async function getDockerStatus() {
  try {
    const docker = getDocker();
    await docker.ping();

    const container = docker.getContainer(env.singboxContainerName);
    const inspection = await container.inspect();

    return {
      available: true,
      containerName: env.singboxContainerName,
      containerState: inspection.State?.Status ?? "unknown"
    };
  } catch (error) {
    return {
      available: false,
      containerName: env.singboxContainerName,
      containerState: "unavailable",
      message: error instanceof Error ? error.message : "Unable to reach Docker"
    };
  }
}

export async function restartSingBoxContainer() {
  const docker = getDocker();
  const container = docker.getContainer(env.singboxContainerName);
  await container.restart();
}

