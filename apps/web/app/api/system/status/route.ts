import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/data";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getDashboardData();
  return NextResponse.json(data);
}

