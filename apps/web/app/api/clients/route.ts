import { NextResponse } from "next/server";
import { z } from "zod";

import { generateClientSecrets } from "@/lib/bootstrap";
import { getSession } from "@/lib/auth";
import { getSettingsSnapshot } from "@/lib/data";
import { db } from "@/lib/db";

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-zA-Z0-9-_]+$/),
  displayName: z.string().trim().min(1)
});

const updateSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
  rotateSecrets: z.boolean().optional()
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clients } = await getSettingsSnapshot();
  return NextResponse.json({ clients });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = createSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid client payload" }, { status: 400 });
  }

  const secrets = await generateClientSecrets();
  const client = await db.clientProfile.create({
    data: {
      ...body.data,
      ...secrets
    }
  });

  return NextResponse.json({ client });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = updateSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid client update payload" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.data.displayName === "string") {
    data.displayName = body.data.displayName;
  }

  if (typeof body.data.enabled === "boolean") {
    data.enabled = body.data.enabled;
  }

  if (body.data.rotateSecrets) {
    Object.assign(data, await generateClientSecrets());
  }

  const client = await db.clientProfile.update({
    where: { id: body.data.id },
    data
  });

  return NextResponse.json({ client });
}

