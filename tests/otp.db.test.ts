/** Real Postgres. Runs only when TEST_DATABASE_URL is set. */
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("phone sign-in (real Postgres)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let otp: typeof import("@/server/otp");
  const ip = () => `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const uniquePhone = () => `+97798${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.SESSION_SECRET = "s".repeat(40);
    process.env.DEMO_OTP = "true"; // returns the code instead of sending an SMS
    ({ prisma } = await import("@/lib/prisma"));
    otp = await import("@/server/otp");
  });

  it("stores only a hash, signs in once, and the code can't be reused", async () => {
    const phone = uniquePhone();
    const c = await otp.startSignIn(phone, ip());
    const row = await prisma.otpChallenge.findUniqueOrThrow({ where: { id: c.challengeId } });
    expect(row.codeHash).not.toContain(c.demoCode!);
    expect(row.codeHash).toHaveLength(64);

    const userId = await otp.verifySignIn(c.challengeId, c.demoCode!, null);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.phone).toBe(phone);
    expect(u.phoneVerified).not.toBeNull();
    await expect(otp.verifySignIn(c.challengeId, c.demoCode!, null)).rejects.toThrow(/wrong or has expired/);
  });

  it("locks the code after 5 wrong guesses, even if the 6th is right", async () => {
    const c = await otp.startSignIn(uniquePhone(), ip());
    const wrong = c.demoCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await expect(otp.verifySignIn(c.challengeId, wrong, null)).rejects.toThrow();
    await expect(otp.verifySignIn(c.challengeId, c.demoCode!, null)).rejects.toThrow(/Too many wrong codes/);
  });

  it("parallel guesses can't exceed the limit", async () => {
    const c = await otp.startSignIn(uniquePhone(), ip());
    const wrong = c.demoCode === "000000" ? "111111" : "000000";
    await Promise.allSettled(Array.from({ length: 20 }, () => otp.verifySignIn(c.challengeId, wrong, null)));
    const row = await prisma.otpChallenge.findUniqueOrThrow({ where: { id: c.challengeId } });
    expect(row.attempts).toBe(5);
  });

  it("rejects expired codes and only the newest code works", async () => {
    const phone = uniquePhone();
    const first = await otp.startSignIn(phone, ip(), new Date(Date.now() - 10 * 60_000));
    await expect(otp.verifySignIn(first.challengeId, first.demoCode!, null)).rejects.toThrow(/expired/);
    const second = await otp.startSignIn(phone, ip());
    const third = await otp.startSignIn(phone, ip(), new Date(Date.now() + 31_000));
    await expect(otp.verifySignIn(second.challengeId, second.demoCode!, null)).rejects.toThrow(/expired/);
    expect(await otp.verifySignIn(third.challengeId, third.demoCode!, null)).toBeTruthy();
  });

  it("rate-limits resends per phone and requests per IP", async () => {
    const phone = uniquePhone();
    await otp.startSignIn(phone, ip());
    await expect(otp.startSignIn(phone, ip())).rejects.toThrow(/wait 30 seconds/);
    const sameIp = ip();
    for (let i = 0; i < 10; i++) await otp.startSignIn(uniquePhone(), sameIp);
    await expect(otp.startSignIn(uniquePhone(), sameIp)).rejects.toThrow(/Too many codes/);
  });

  it("moves a guest's orders into the existing account on sign-in", async () => {
    const phone = uniquePhone();
    const owner = await prisma.user.create({ data: { phone, phoneVerified: new Date() } });
    const guest = await prisma.user.create({ data: { name: "Guest" } });
    await prisma.order.create({ data: { number: `KS-G${Date.now()}`, userId: guest.id, subtotalMinor: 100, totalMinor: 100 } });

    const c = await otp.startSignIn(phone, ip());
    const signedIn = await otp.verifySignIn(c.challengeId, c.demoCode!, guest.id);
    expect(signedIn).toBe(owner.id);
    expect(await prisma.order.count({ where: { userId: owner.id } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: guest.id } })).deletedAt).not.toBeNull();
  });

  it("attaches the phone to a guest who has no account yet", async () => {
    const phone = uniquePhone();
    const guest = await prisma.user.create({ data: { name: "New buyer" } });
    const c = await otp.startSignIn(phone, ip());
    expect(await otp.verifySignIn(c.challengeId, c.demoCode!, guest.id)).toBe(guest.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: guest.id } })).phone).toBe(phone);
  });

  it("never merges one signed-in account into another", async () => {
    const a = await prisma.user.create({ data: { phone: uniquePhone(), phoneVerified: new Date() } });
    const phoneB = uniquePhone();
    const b = await prisma.user.create({ data: { phone: phoneB, phoneVerified: new Date() } });
    await prisma.order.create({ data: { number: `KS-A${Date.now()}`, userId: a.id, subtotalMinor: 1, totalMinor: 1 } });
    const c = await otp.startSignIn(phoneB, ip());
    expect(await otp.verifySignIn(c.challengeId, c.demoCode!, a.id)).toBe(b.id);
    expect(await prisma.order.count({ where: { userId: a.id } })).toBe(1);
  });
});
