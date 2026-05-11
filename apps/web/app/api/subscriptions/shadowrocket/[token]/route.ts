import { NextResponse } from "next/server";

import { buildShadowrocketText } from "@/lib/config";
import { getSettingsSnapshot } from "@/lib/data";

export async function GET(_: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const { server, proxy, clients } = await getSettingsSnapshot();
  const client = clients.find((item: (typeof clients)[number]) => item.token === token && item.enabled);

  if (!client) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(buildShadowrocketText(server, proxy, client), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}
