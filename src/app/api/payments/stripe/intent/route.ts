import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { createIntentFromQuote } from "@/server/payments/stripe";
import { toErrorResponse } from "../../fonepay/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ quoteId: z.string().min(1).max(64) });

/** POST /api/payments/stripe/intent { quoteId } -> { clientSecret } for Stripe Payment Element. */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId(req);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
    return NextResponse.json(await createIntentFromQuote(parsed.data.quoteId, userId));
  } catch (e) {
    return toErrorResponse(e);
  }
}
