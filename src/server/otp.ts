import "server-only";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { maskPhone, normalizePhone } from "./sms/phone";
import { senderFor } from "./sms/providers";

export const CODE_TTL_MS = 5 * 60_000;
export const MAX_ATTEMPTS = 5;
export const LIMITS = {
  resendGapMs: 30_000, // per phone
  perPhone15m: 3,
  perPhoneDay: 8,
  perIpHour: 10,
};

export class OtpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new OtpError("Sign-in isn't configured on this site", 501);
  return s;
}

const hmac = (msg: string) => createHmac("sha256", secret()).update(msg).digest("hex");
export const hashCode = (challengeId: string, code: string) => hmac(`otp:${challengeId}:${code}`);
export const hashIp = (ip: string) => hmac(`ip:${ip}`).slice(0, 32);

/** Client IP as reported by the platform proxy (Vercel / a load balancer). */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export const demoOtpEnabled = () => process.env.DEMO_OTP === "true";

/** Step 1: validate the number, rate-limit, store a hashed code, send the SMS. */
export async function startSignIn(phoneInput: string, ip: string, now = new Date()) {
  const phone = normalizePhone(phoneInput);
  if (!phone.ok) throw new OtpError(phone.reason, 422);
  const ipHash = hashIp(ip);
  const t = now.getTime();

  const [last, in15m, inDay, ipHour] = await Promise.all([
    prisma.otpChallenge.findFirst({ where: { phone: phone.e164 }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.otpChallenge.count({ where: { phone: phone.e164, createdAt: { gt: new Date(t - 15 * 60_000) } } }),
    prisma.otpChallenge.count({ where: { phone: phone.e164, createdAt: { gt: new Date(t - 86_400_000) } } }),
    prisma.otpChallenge.count({ where: { ipHash, createdAt: { gt: new Date(t - 3_600_000) } } }),
  ]);
  if (last && t - last.createdAt.getTime() < LIMITS.resendGapMs) throw new OtpError("Please wait 30 seconds before asking for another code", 429);
  if (in15m >= LIMITS.perPhone15m || inDay >= LIMITS.perPhoneDay || ipHour >= LIMITS.perIpHour) {
    throw new OtpError("Too many codes requested. Try again later.", 429);
  }

  const demo = demoOtpEnabled();
  const sender = demo ? null : senderFor(phone.e164);
  if (!demo && !sender) throw new OtpError("SMS sign-in isn't available for that number yet", 503);

  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  await prisma.$transaction([
    // Only the newest code for a number works.
    prisma.otpChallenge.updateMany({ where: { phone: phone.e164, consumedAt: null }, data: { consumedAt: now } }),
    prisma.otpChallenge.create({
      // createdAt from the same clock as the rate-limit checks above, not the DB default.
      data: { id, phone: phone.e164, codeHash: hashCode(id, code), ipHash, createdAt: now, expiresAt: new Date(t + CODE_TTL_MS) },
    }),
  ]);

  if (sender) {
    try {
      await sender.send(phone.e164, `${code} is your Koseli sign-in code. It expires in 5 minutes. Don't share it with anyone.`);
    } catch (e) {
      console.error(`[otp] ${sender.name} send failed`, e);
      throw new OtpError("We couldn't send the SMS. Check the number and try again.", 502);
    }
  }
  return { challengeId: id, masked: maskPhone(phone.e164), ...(demo ? { demoCode: code } : {}) };
}

const GENERIC = "That code is wrong or has expired";

/** Step 2: check the code, then resolve (and if needed merge into) the account. Returns the user id to sign in. */
export async function verifySignIn(challengeId: string, code: string, currentUserId: string | null, now = new Date()) {
  if (!/^\d{6}$/.test(code)) throw new OtpError(GENERIC, 400);
  const ch = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!ch || ch.consumedAt || ch.expiresAt < now) throw new OtpError(GENERIC, 400);

  // Count the guess before checking it, atomically, so parallel guesses can't exceed the limit.
  const counted = await prisma.otpChallenge.updateMany({
    where: { id: ch.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) throw new OtpError("Too many wrong codes. Ask for a new one.", 429);

  const a = Buffer.from(hashCode(ch.id, code));
  const b = Buffer.from(ch.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new OtpError(GENERIC, 400);

  // Single use: only one request may consume it.
  const consumed = await prisma.otpChallenge.updateMany({ where: { id: ch.id, consumedAt: null }, data: { consumedAt: now } });
  if (consumed.count === 0) throw new OtpError(GENERIC, 400);

  return resolveAccount(ch.phone, currentUserId, now);
}

/**
 * The phone now proves who this is. Cases:
 *  - an account with this phone exists: sign into it, and move a guest's orders into it
 *  - the current session is a guest (no phone): attach the phone to that guest
 *  - otherwise: create an account
 */
export async function resolveAccount(phone: string, currentUserId: string | null, now = new Date()): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const owner = await tx.user.findUnique({ where: { phone }, select: { id: true, deletedAt: true } });
    const current = currentUserId
      ? await tx.user.findUnique({ where: { id: currentUserId }, select: { id: true, phone: true, deletedAt: true } })
      : null;
    const guest = current && !current.phone && !current.deletedAt ? current : null;

    if (owner && !owner.deletedAt) {
      if (guest && guest.id !== owner.id) {
        await tx.order.updateMany({ where: { userId: guest.id }, data: { userId: owner.id } });
        await tx.address.updateMany({ where: { userId: guest.id }, data: { userId: owner.id } });
        await tx.recipient.updateMany({ where: { userId: guest.id }, data: { userId: owner.id } });
        await tx.user.update({ where: { id: guest.id }, data: { deletedAt: now } });
      }
      await tx.user.update({ where: { id: owner.id }, data: { phoneVerified: now } });
      return owner.id;
    }
    if (owner?.deletedAt) throw new OtpError("This account was closed. Contact support to reopen it.", 403);

    if (guest) {
      await tx.user.update({ where: { id: guest.id }, data: { phone, phoneVerified: now } });
      return guest.id;
    }
    return (await tx.user.create({ data: { phone, phoneVerified: now }, select: { id: true } })).id;
  });
}
