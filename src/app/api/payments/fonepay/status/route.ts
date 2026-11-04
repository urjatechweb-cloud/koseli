import { NextResponse } from "next/server";
import { requireUserId } from "@/server/auth";
import { pollFonepayQr } from "@/server/payments/payment-service";
import { toErrorResponse } from "../errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/payments/fonepay/status?prn=…  — client polls every ~3s while the QR is shown. */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId(req);
    const prn = new URL(req.url).searchParams.get("prn");
    if (!prn || !/^[A-Z0-9]{8,32}$/.test(prn)) {
      return NextResponse.json({ error: "invalid prn" }, { status: 400 });
    }
    return NextResponse.json(await pollFonepayQr(prn, userId));
  } catch (e) {
    return toErrorResponse(e);
  }
}
