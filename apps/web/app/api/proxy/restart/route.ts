import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { restartSingBoxContainer } from "@/lib/docker";

export async function POST() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await restartSingBoxContainer();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to restart sing-box" },
      { status: 500 }
    );
  }
}

