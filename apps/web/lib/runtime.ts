import fs from "node:fs/promises";
import path from "node:path";

import env from "@/lib/env";

export const runtimePaths = {
  root: env.runtimeDir,
  dataDir: path.join(env.runtimeDir, "data"),
  generatedDir: path.join(env.runtimeDir, "generated"),
  metadataFile: path.join(env.runtimeDir, "generated", "deploy-metadata.json"),
  singBoxConfig: path.join(env.runtimeDir, "generated", "sing-box.json")
};

export async function ensureRuntimeDirectories() {
  await fs.mkdir(runtimePaths.dataDir, { recursive: true });
  await fs.mkdir(runtimePaths.generatedDir, { recursive: true });
}

export async function writeGeneratedConfig(configText: string) {
  await ensureRuntimeDirectories();
  await fs.writeFile(runtimePaths.singBoxConfig, configText, "utf8");
  await fs.writeFile(
    runtimePaths.metadataFile,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        configPath: runtimePaths.singBoxConfig
      },
      null,
      2
    ),
    "utf8"
  );
}

export async function readDeployMetadata() {
  try {
    const raw = await fs.readFile(runtimePaths.metadataFile, "utf8");
    return JSON.parse(raw) as { updatedAt: string; configPath: string };
  } catch {
    return null;
  }
}

export async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

