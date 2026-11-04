import { NextResponse } from "next/server";
import { getSessionUserId, setSessionCookie } from "@/server/auth";
import { CheckoutInput, createOrder } from "@/server/orders";
import { toErrorResponse } from "../payments/fonepay/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/orders — guest checkout. Creates the order (and a guest session if needed). */
export async function POST(req: Request) {
  try {
    const parsed = CheckoutInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json({ error: first ? `${first.path.join(".")}: ${first.message}` : "invalid order" }, { status: 400 });
    }
    const { order, userId } = await createOrder(parsed.data, getSessionUserId());
    setSessionCookie(userId);
    return NextResponse.json({ orderId: order.id, number: order.number, totalMinor: order.totalMinor });
  } catch (e) {
    return toErrorResponse(e);
  }
}
