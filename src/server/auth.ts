import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Guest sessions: a signed, httpOnly cookie holding a user id.
 *
 * Checkout creates a brand-new guest User for every new session. It never
 * looks a user up by phone or email, so typing someone else's number cannot
 * open their orders. Real sign-in (OTP / Auth.js) can later merge guests.
 */

export const SESSION_COOKIE = "ks_session";
const MAX_AGE_S = 60 * 60 * 24 * 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new AuthNotConfiguredError("SESSION_SECRET must be set (32+ chars)");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function encodeSession(userId: string, now = Date.now()): string {
  const payload = `${userId}.${Math.floor(now / 1000) + MAX_AGE_S}`;
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, mac] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${userId}.${exp}`));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < now) return null;
  return userId;
}

export function getSessionUserId(): string | null {
  return decodeSession(cookies().get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(userId: string): void {
  cookies().set(SESSION_COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

/**
 * The user behind the cookie, for pages. `signedIn` means a verified phone,
 * as opposed to a guest who has only checked out. Deleted users (merged
 * guests) count as signed out.
 */
export async function getCurrentUser() {
  let id: string | null = null;
  try {
    id = getSessionUserId();
  } catch {
    return null; // SESSION_SECRET missing: render pages signed out rather than crash every page
  }
  if (!id) return null;
  const { prisma } = await import("@/lib/prisma");
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, phone: true, phoneVerified: true, deletedAt: true } });
  if (!u || u.deletedAt) return null;
  return { id: u.id, name: u.name, phone: u.phone, signedIn: Boolean(u.phone && u.phoneVerified) };
}

/** For API routes: the signed-in (guest) user, or 401. */
export async function requireUserId(_req: Request): Promise<string> {
  const id = getSessionUserId();
  if (!id) throw new AuthRequiredError();
  return id;
}

export class AuthNotConfiguredError extends Error {
  readonly status = 501;
}

export class AuthRequiredError extends Error {
  readonly status = 401;
  constructor() {
    super("sign in or start checkout first");
  }
}
