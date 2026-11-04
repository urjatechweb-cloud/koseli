import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { INTERNATIONAL_CURRENCIES, quoteOrder } from "@/server/fx/fx-service";
import { toErrorResponse } from "../../payments/fonepay/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  orderId: z.string().min(1).max(64),
  currency: z.enum(INTERNATIONAL_CURRENCIES),
});

/** POST /api/fx/quote { orderId, currency } -> 15-minute locked price in the buyer's currency. */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId(req);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
    const quote = await quoteOrder(parsed.data.orderId, userId, parsed.data.currency);
    if (!quote) return NextResponse.json({ error: "order not found" }, { status: 404 });
    return NextResponse.json(quote);
  } catch (e) {
    return toErrorResponse(e);
  }
}
