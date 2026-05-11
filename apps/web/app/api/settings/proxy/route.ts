import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { getSettingsSnapshot } from "@/lib/data";
import { db } from "@/lib/db";

const schema = z.object({
  hy2ObfsPassword: z.string().min(1),
  hy2UpMbps: z.number().int().positive(),
  hy2DownMbps: z.number().int().positive(),
  enableTrojan: z.boolean(),
  masqueradeUrl: z.string().url()
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { proxy } = await getSettingsSnapshot();
  return NextResponse.json(proxy);
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid proxy settings" }, { status: 400 });
  }

  const updated = await db.proxyProfile.update({
    where: { id: 1 },
    data: body.data
  });

  return NextResponse.json({ proxy: updated });
}

