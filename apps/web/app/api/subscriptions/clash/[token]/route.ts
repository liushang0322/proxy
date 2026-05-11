import { NextResponse } from "next/server";

import { stringifyClashConfig } from "@/lib/config";
import { getSettingsSnapshot } from "@/lib/data";

export async function GET(_: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const { server, proxy, clients } = await getSettingsSnapshot();
  const client = clients.find((item: (typeof clients)[number]) => item.token === token && item.enabled);

  if (!client) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(stringifyClashConfig(server, proxy, client), {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Content-Disposition": `inline; filename="${client.name}.yaml"`
    }
  });
}
