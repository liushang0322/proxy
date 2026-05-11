import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { stringifySingBoxConfig } from "@/lib/config";
import { getSettingsSnapshot } from "@/lib/data";
import { restartSingBoxContainer } from "@/lib/docker";
import { writeGeneratedConfig } from "@/lib/runtime";

export async function POST() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { server, proxy, clients } = await getSettingsSnapshot();
  const configText = stringifySingBoxConfig(server, proxy, clients);
  await writeGeneratedConfig(configText);

  let restarted = false;
  try {
    await restartSingBoxContainer();
    restarted = true;
  } catch {
    restarted = false;
  }

  return NextResponse.json({
    ok: true,
    restarted
  });
}

