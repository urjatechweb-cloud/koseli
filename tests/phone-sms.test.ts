import { describe, expect, it, vi } from "vitest";
import { maskPhone, normalizePhone } from "@/server/sms/phone";
import { senderFor, sparrowSender, twilioSender } from "@/server/sms/providers";

describe("normalizePhone", () => {
  const ok = (s: string) => { const r = normalizePhone(s); if (!r.ok) throw new Error(r.reason); return r.e164; };
  it("accepts Nepali mobiles with or without +977", () => {
    expect(ok("9846000000")).toBe("+9779846000000");
    expect(ok("+977 984-600-0000")).toBe("+9779846000000");
    expect(ok("00977 9806000000")).toBe("+9779806000000");
  });
  it("accepts diaspora mobiles", () => {
    expect(ok("+44 7700 900123")).toBe("+447700900123");
    expect(ok("+44 07700 900123")).toBe("+447700900123"); // trunk zero typed by habit
    expect(ok("+971 50 123 4567")).toBe("+971501234567");
    expect(ok("+974 5512 3456")).toBe("+97455123456");
    expect(ok("+61 412 345 678")).toBe("+61412345678");
    expect(ok("+1 415 555 2671")).toBe("+14155552671");
  });
  it("rejects landlines, junk, and countries outside the allow-list (SMS pumping)", () => {
    expect(normalizePhone("+977 1 4412345").ok).toBe(false); // Kathmandu landline
    expect(normalizePhone("hello").ok).toBe(false);
    expect(normalizePhone("+882 1234 5678").ok).toBe(false); // international network range
    expect(normalizePhone("+7 912 345 6789").ok).toBe(false);
  });
  it("masks for display", () => {
    expect(maskPhone("+9779846000123")).toBe("+977 98•••••123");
  });
});

describe("SMS providers", () => {
  it("routes Nepal to Sparrow and the rest to Twilio", () => {
    const env = { SPARROW_TOKEN: "t", SPARROW_FROM: "Koseli", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "x", TWILIO_FROM: "+15550000000" };
    expect(senderFor("+9779846000000", env)?.name).toBe("sparrow");
    expect(senderFor("+447700900123", env)?.name).toBe("twilio");
    expect(senderFor("+9779846000000", { ...env, SPARROW_TOKEN: "" })?.name).toBe("twilio");
    expect(senderFor("+447700900123", {})).toBeNull();
  });
  it("never uses the log sender in production", () => {
    expect(senderFor("+9779846000000", { SMS_PROVIDER: "log", NODE_ENV: "production" })).toBeNull();
    expect(senderFor("+9779846000000", { SMS_PROVIDER: "log", NODE_ENV: "development" })?.name).toBe("log");
  });
  it("Sparrow request uses the 10-digit local number", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}"));
    await sparrowSender({ SPARROW_TOKEN: "tok", SPARROW_FROM: "Koseli" }, f)!.send("+9779846000000", "123456 is your code");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.sparrowsms.com/v2/sms/");
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({ token: "tok", from: "Koseli", to: "9846000000", text: "123456 is your code" });
  });
  it("Twilio request uses basic auth and a messaging service when given", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    await twilioSender({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "sec", TWILIO_MESSAGING_SERVICE_SID: "MG9" }, f)!.send("+447700900123", "hi");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("AC1:sec").toString("base64")}`);
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({ To: "+447700900123", Body: "hi", MessagingServiceSid: "MG9" });
  });
  it("surfaces provider errors", async () => {
    const f = vi.fn().mockResolvedValue(new Response("bad number", { status: 400 }));
    await expect(sparrowSender({ SPARROW_TOKEN: "t", SPARROW_FROM: "K" }, f)!.send("+9779846000000", "x")).rejects.toThrow(/sparrow 400/);
  });
});
