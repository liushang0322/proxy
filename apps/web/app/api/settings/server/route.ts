import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { getSettingsSnapshot } from "@/lib/data";
import { db } from "@/lib/db";

const schema = z.object({
  domain: z.string().min(1),
  serverIp: z.string().min(1),
  certificatePath: z.string().min(1),
  privateKeyPath: z.string().min(1),
  panelPort: z.number().int().positive().optional(),
  hysteriaPort: z.number().int().positive(),
  trojanPort: z.number().int().positive()
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { server } = await getSettingsSnapshot();
  return NextResponse.json(server);
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid server settings" }, { status: 400 });
  }

  const updated = await db.serverSettings.update({
    where: { id: 1 },
    data: body.data
  });

  return NextResponse.json({ server: updated });
}

