import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import env from "@/lib/env";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "vpn_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

type SessionPayload = {
  username: string;
  exp: number;
};

function signPayload(payload: string) {
  return crypto
    .createHmac("sha256", env.sessionSecret)
    .update(payload)
    .digest("hex");
}

function encodeSession(payload: SessionPayload) {
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = signPayload(raw);
  return `${raw}.${sig}`;
}

function decodeSession(value: string): SessionPayload | null {
  const [raw, sig] = value.split(".");

  if (!raw || !sig) {
    return null;
  }

  const expected = signPayload(raw);

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as SessionPayload;

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

export async function ensureDefaultAdmin() {
  const existing = await db.adminUser.findFirst();

  if (existing) {
    return existing;
  }

  const passwordHash = await bcrypt.hash(env.adminPassword, 10);

  return db.adminUser.create({
    data: {
      username: env.adminUsername,
      passwordHash
    }
  });
}

export async function login(username: string, password: string) {
  await ensureDefaultAdmin();

  const admin = await db.adminUser.findUnique({
    where: { username }
  });

  if (!admin) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, admin.passwordHash);

  if (!passwordMatches) {
    return null;
  }

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  return encodeSession({ username: admin.username, exp });
}

export async function getSession() {
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;

  if (!value) {
    return null;
  }

  return decodeSession(value);
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function isAuthenticated() {
  return Boolean(await getSession());
}

