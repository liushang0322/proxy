import { NextResponse } from "next/server";
import { z } from "zod";

import { login, SESSION_COOKIE } from "@/lib/auth";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ error: "Invalid login payload" }, { status: 400 });
  }

  const sessionToken = await login(body.data.username, body.data.password);

  if (!sessionToken) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}

