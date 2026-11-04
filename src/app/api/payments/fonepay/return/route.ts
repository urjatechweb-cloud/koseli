import { NextResponse } from "next/server";
import { handleFonepayWebReturn } from "@/server/payments/payment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/payments/fonepay/return — Fonepay redirects the payer's browser here.
 * Public by design (no session required): trust comes from the DV signature
 * plus the server-to-server verification call, not from the browser.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const appUrl = process.env.APP_URL ?? url.origin;
  try {
    const result = await handleFonepayWebReturn(url.searchParams);
    const dest = result.orderId
      ? `/orders/${encodeURIComponent(result.orderId)}?payment=${result.ok ? "success" : "failed"}`
      : "/checkout?payment=failed";
    return NextResponse.redirect(new URL(dest, appUrl), 303);
  } catch (e) {
    console.error("[fonepay:return]", e);
    return NextResponse.redirect(new URL("/checkout?payment=error", appUrl), 303);
  }
}
