import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  amountToMinor, buildWebPaymentUrl, createDynamicQr, fonepayDate, minorToAmount, verifyWebReturn, type FonepayConfig,
} from "@/server/payments/fonepay";

const cfg: FonepayConfig = {
  merchantCode: "NBQM", secretKey: "a7e3512f5032480a83137793cb2021dc",
  qrUsername: "u", qrPassword: "p",
  webBaseUrl: "https://dev-clientapi.fonepay.com", qrBaseUrl: "https://dev-merchantapi.fonepay.com",
};
const hmac = (s: string) => createHmac("sha512", cfg.secretKey).update(s).digest("hex").toUpperCase();

describe("amount codec", () => {
  it("round-trips paisa", () => {
    expect(minorToAmount(125_050)).toBe("1250.50");
    expect(minorToAmount(7)).toBe("0.07");
    expect(amountToMinor("1250.5")).toBe(125_050);
    expect(amountToMinor("1250")).toBe(125_000);
    expect(() => amountToMinor("1,250")).toThrow();
  });
  it("formats DT in Nepal time (UTC+5:45)", () => {
    expect(fonepayDate(new Date("2026-11-04T18:30:00Z"))).toBe("11/05/2026");
  });
});

describe("web checkout", () => {
  it("signs request fields in order PID,MD,PRN,AMT,CRN,DT,R1,R2,RU", () => {
    const u = new URL(buildWebPaymentUrl(cfg, { prn: "CHTEST1", amountMinor: 120_000, remarks1: "CH-1,23", returnUrl: "https://x.np/r" }, new Date("2026-11-04T06:00:00Z")));
    expect(u.searchParams.get("R1")).toBe("CH-1 23"); // commas stripped
    expect(u.searchParams.get("DV")).toBe(hmac("NBQM,P,CHTEST1,1200.00,NPR,11/04/2026,CH-1 23,N/A,https://x.np/r"));
  });

  const signedReturn = (o: Record<string, string>) => {
    const dv = hmac(["PRN", "PID", "PS", "RC", "UID", "BC", "INI", "P_AMT", "R_AMT"].map((k) => o[k] ?? "").join(","));
    return new URLSearchParams({ ...o, DV: dv });
  };
  const okReturn = { PRN: "CHTEST1", PID: "NBQM", PS: "true", RC: "successful", UID: "123", BC: "NICENPKA", INI: "x", P_AMT: "1200.00", R_AMT: "1200.00", BID: "" };
  const okXml = "<response><success>true</success><response_code>successful</response_code></response>";

  it("accepts a valid, server-verified return", async () => {
    const f = vi.fn().mockResolvedValue(new Response(okXml));
    const r = await verifyWebReturn(cfg, signedReturn(okReturn), 120_000, f);
    expect(r).toEqual({ ok: true, prn: "CHTEST1", uid: "123", paidMinor: 120_000 });
    expect(f).toHaveBeenCalledOnce();
  });
  it("rejects a tampered return as untrusted without calling Fonepay", async () => {
    const q = signedReturn(okReturn); q.set("P_AMT", "1.00");
    const f = vi.fn();
    const r = await verifyWebReturn(cfg, q, 120_000, f);
    expect(r).toMatchObject({ ok: false, trusted: false, reason: "bad signature" });
    expect(f).not.toHaveBeenCalled();
  });
  it("marks a signed decline as trusted failure", async () => {
    const r = await verifyWebReturn(cfg, signedReturn({ ...okReturn, PS: "false", RC: "failed" }), 120_000, vi.fn());
    expect(r).toMatchObject({ ok: false, trusted: true });
  });
  it("does not settle when server verification says no", async () => {
    const f = vi.fn().mockResolvedValue(new Response("<response><success>false</success></response>"));
    const r = await verifyWebReturn(cfg, signedReturn(okReturn), 120_000, f);
    expect(r).toMatchObject({ ok: false, trusted: false });
  });
});

describe("dynamic QR", () => {
  it("posts signed body and returns qrMessage", async () => {
    const f = vi.fn().mockResolvedValue(Response.json({ success: true, qrMessage: "000201...", thirdpartyQrWebSocketUrl: "wss://ws" }));
    const r = await createDynamicQr(cfg, { prn: "CHQR1", amountMinor: 50_000, remarks1: "CH-9" }, f);
    expect(r.qrMessage).toBe("000201...");
    const body = JSON.parse(f.mock.calls[0]![1].body);
    expect(body.dataValidation).toBe(hmac("500.00,CHQR1,NBQM,CH-9,N/A"));
  });
  it("throws when Fonepay returns no QR", async () => {
    const f = vi.fn().mockResolvedValue(Response.json({ success: false, message: "Invalid credentials" }, { status: 400 }));
    await expect(createDynamicQr(cfg, { prn: "CHQR2", amountMinor: 100, remarks1: "x" }, f)).rejects.toThrow(/Invalid credentials/);
  });
});
