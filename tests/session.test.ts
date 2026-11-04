import { beforeAll, describe, expect, it } from "vitest";

let decodeSession: typeof import("@/server/auth").decodeSession;
let encodeSession: typeof import("@/server/auth").encodeSession;
let nepalNow: typeof import("@/server/orders").nepalNow;
let CheckoutInput: typeof import("@/server/orders").CheckoutInput;

beforeAll(async () => {
  process.env.SESSION_SECRET = "x".repeat(40);
  ({ decodeSession, encodeSession } = await import("@/server/auth"));
  ({ nepalNow, CheckoutInput } = await import("@/server/orders"));
});

describe("guest session cookie", () => {
  it("round-trips", () => {
    expect(decodeSession(encodeSession("user_1"))).toBe("user_1");
  });
  it("rejects a tampered user id", () => {
    const [, exp, mac] = encodeSession("user_1").split(".");
    expect(decodeSession(`user_2.${exp}.${mac}`)).toBeNull();
  });
  it("rejects expired and malformed tokens", () => {
    const t = encodeSession("user_1", Date.now() - 31 * 86_400_000);
    expect(decodeSession(t)).toBeNull();
    expect(decodeSession("garbage")).toBeNull();
    expect(decodeSession(undefined)).toBeNull();
  });
  it("rejects a token signed with another secret", async () => {
    const t = encodeSession("user_1");
    process.env.SESSION_SECRET = "y".repeat(40);
    expect(decodeSession(t)).toBeNull();
    process.env.SESSION_SECRET = "x".repeat(40);
  });
});

describe("checkout rules", () => {
  it("uses Nepal time (UTC+5:45) for today and cut-offs", () => {
    expect(nepalNow(new Date("2026-11-04T18:20:00Z"))).toEqual({ date: "2026-11-05", time: "00:05" });
  });
  const base = {
    items: [{ productId: "p1", quantity: 1 }], city: "pokhara", deliverOn: "2026-11-05",
    senderName: "Sita", senderContact: "sita@example.com", recipientName: "Aama",
    recipientPhone: "9846000000", line1: "Lakeside",
  };
  it("accepts Nepali mobiles with or without +977", () => {
    expect(CheckoutInput.safeParse(base).success).toBe(true);
    expect(CheckoutInput.safeParse({ ...base, recipientPhone: "+9779806000000" }).success).toBe(true);
  });
  it("rejects foreign numbers, prices from the client, and huge quantities", () => {
    expect(CheckoutInput.safeParse({ ...base, recipientPhone: "07700900000" }).success).toBe(false);
    expect(CheckoutInput.safeParse({ ...base, items: [{ productId: "p1", quantity: 99 }] }).success).toBe(false);
    const withPrice = CheckoutInput.parse({ ...base, items: [{ productId: "p1", quantity: 1, priceMinor: 1 }] });
    expect(withPrice.items[0]).not.toHaveProperty("priceMinor");
  });
});
