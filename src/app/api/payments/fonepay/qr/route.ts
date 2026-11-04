import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { startFonepayQr, startFonepayWeb } from "@/server/payments/payment-service";
import { toErrorResponse } from "../errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  orderId: z.string().min(1).max(64),
  mode: z.enum(["qr", "web"]).default("qr"),
});

/** POST /api/payments/fonepay/qr  { orderId, mode? } */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId(req);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
    const { orderId, mode } = parsed.data;

    if (mode === "web") {
      const appUrl = process.env.APP_URL;
      if (!appUrl) throw new Error("APP_URL not set");
      const redirectUrl = await startFonepayWeb(orderId, userId, appUrl);
      return NextResponse.json({ redirectUrl });
    }

    const { prn, qrMessage, websocketUrl, expiresAt } = await startFonepayQr(orderId, userId);
    const qrDataUrl = await QRCode.toDataURL(qrMessage, { errorCorrectionLevel: "M", margin: 1, width: 320 });
    return NextResponse.json({ prn, qrDataUrl, websocketUrl, expiresAt });
  } catch (e) {
    return toErrorResponse(e);
  }
}
